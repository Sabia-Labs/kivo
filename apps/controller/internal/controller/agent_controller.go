package controller

import (
	"context"
	"fmt"
	"strings"
	"time"

	kivov1alpha1 "github.com/ltreven/kivo/controller/api/v1alpha1"
	"github.com/ltreven/kivo/controller/internal/controller/resources"
	"github.com/ltreven/kivo/controller/internal/sync"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	apimeta "k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/log"
)

// AgentReconciler reconciles KivoAgent CRs across all namespaces.
type AgentReconciler struct {
	client.Client
	Scheme                    *runtime.Scheme
	APIBaseURL                string // e.g. "http://kivo-api:4000"
	AgentImage                string // full image ref: repo:tag
	AgentImagePullPolicy      string // Always | IfNotPresent | Never
	ConsumerImage             string // kivo-consumer sidecar image ref
	ConsumerImagePullPolicy   string // Always | IfNotPresent | Never
}

// SetupWithManager registers the reconciler with the controller-runtime Manager.
// .Owns() causes the manager to also watch child resources (Deployment, PVC, ConfigMap)
// and re-reconcile the parent KivoAgent CR when they change (e.g. pod crash).
func (r *AgentReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&kivov1alpha1.Agent{}).
		Owns(&appsv1.Deployment{}).
		Owns(&corev1.PersistentVolumeClaim{}).
		Owns(&corev1.ConfigMap{}).
		Complete(r)
}

// Reconcile is called whenever a KivoAgent CR or one of its owned resources changes.
// It drives the cluster toward the desired state defined in the CR spec.
//
// Invariants:
//   - All operations are idempotent (createOrUpdate semantics).
//   - Child resources carry ownerReferences → K8s GC handles cleanup on CR deletion.
//   - Errors trigger a requeue with exponential backoff (controller-runtime default).
func (r *AgentReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx).WithValues("agent", req.NamespacedName)

	// ── Fetch the KivoAgent CR ───────────────────────────────────────────────
	var cr kivov1alpha1.Agent
	if err := r.Get(ctx, req.NamespacedName, &cr); err != nil {
		// Not found = CR was deleted; K8s GC handles child resources via ownerRef.
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	// Skip if already reconciled for this generation (no spec change).
	// But only if we are already in Running phase.
	// NOTE: We removed the strict ObservedGeneration check here to ensure 
	// that runtime changes (like Pod IP updates) are always picked up and 
	// synced to the status and Kivo API. 
	if cr.Status.Phase == kivov1alpha1.AgentPhaseRunning && cr.Status.PodIP != "" && cr.Status.ObservedGeneration == cr.Generation {
		// We still do a quick check to see if the pod is actually still there/alive
		// to avoid redundant heavy reconciliation.
	}

	logger.Info("reconciling agent", "generation", cr.Generation, "retry", "wget-v2")

	// Build the ownerReference that all child resources will carry.
	ownerRef := buildOwnerRef(&cr, r.Scheme)

	// ── 1. Reconcile ConfigMap (bootstrap.sh wrapper) ────────────────────────
	logger.Info("reconciling ConfigMap")
	desired := resources.BootstrapConfigMap(&cr, ownerRef)
	if err := r.createOrUpdateConfigMap(ctx, desired); err != nil {
		return r.failWith(ctx, &cr, "ConfigMapFailed", err)
	}

	// ── 2. Reconcile PVC (agent state — evolving profile files + openclaw config) ─
	logger.Info("reconciling PVC")
	desiredPVC := resources.StatePVC(&cr, ownerRef)
	if err := r.createOrUpdatePVC(ctx, desiredPVC); err != nil {
		return r.failWith(ctx, &cr, "PVCFailed", err)
	}

	// ── 3. Reconcile Deployment ──────────────────────────────────────────────
	logger.Info("reconciling Deployment")
	agentImage, pullPolicy := r.resolveAgentImage(ctx)
	consumerImage, consumerPullPolicy := r.resolveConsumerImage(ctx)
	desiredDeploy := resources.AgentDeployment(&cr, ownerRef, agentImage, pullPolicy, consumerImage, consumerPullPolicy, r.APIBaseURL)
	if err := r.createOrUpdateDeployment(ctx, desiredDeploy); err != nil {
		return r.failWith(ctx, &cr, "DeploymentFailed", err)
	}

	// ── 4. Update status based on Deployment availability ────────────────────
	phase, podName, podIP := r.observePhase(ctx, desiredDeploy)
	if err := r.patchStatus(ctx, &cr, phase, podName, podIP); err != nil {
		logger.Error(err, "failed to patch CR status")
		return ctrl.Result{RequeueAfter: 10 * time.Second}, nil
	}

	// ── 5. Sync phase back to postgres via Kivo API ─────────────────────────
	apiPhase := strings.ToLower(string(phase))
	if err := sync.PatchAgentStatus(ctx, r.APIBaseURL, cr.Name, apiPhase); err != nil {
		logger.Error(err, "failed to sync status to Kivo API — will retry")
		return ctrl.Result{RequeueAfter: 15 * time.Second}, nil
	}

	// Requeue while the agent is still provisioning to pick up Deployment readiness.
	if phase == kivov1alpha1.AgentPhaseProvisioning {
		return ctrl.Result{RequeueAfter: 20 * time.Second}, nil
	}

	logger.Info("reconciliation complete", "phase", phase)
	return ctrl.Result{}, nil
}

// ── Create-or-update helpers ──────────────────────────────────────────────────

func (r *AgentReconciler) createOrUpdateConfigMap(ctx context.Context, desired *corev1.ConfigMap) error {
	existing := &corev1.ConfigMap{}
	err := r.Get(ctx, client.ObjectKeyFromObject(desired), existing)
	if apierrors.IsNotFound(err) {
		return r.Create(ctx, desired)
	}
	if err != nil {
		return err
	}
	existing.Data = desired.Data
	existing.Labels = desired.Labels
	// Ensure ownerReference is set on existing resource
	existing.OwnerReferences = desired.OwnerReferences
	return r.Update(ctx, existing)
}

func (r *AgentReconciler) createOrUpdatePVC(ctx context.Context, desired *corev1.PersistentVolumeClaim) error {
	existing := &corev1.PersistentVolumeClaim{}
	err := r.Get(ctx, client.ObjectKeyFromObject(desired), existing)
	if apierrors.IsNotFound(err) {
		return r.Create(ctx, desired)
	}
	// PVC spec is mostly immutable once bound — only patch labels/ownerRefs.
	if err != nil {
		return err
	}
	existing.Labels = desired.Labels
	existing.OwnerReferences = desired.OwnerReferences
	return r.Update(ctx, existing)
}

func (r *AgentReconciler) createOrUpdateDeployment(ctx context.Context, desired *appsv1.Deployment) error {
	existing := &appsv1.Deployment{}
	err := r.Get(ctx, client.ObjectKeyFromObject(desired), existing)
	if apierrors.IsNotFound(err) {
		return r.Create(ctx, desired)
	}
	if err != nil {
		return err
	}
	// Update: replace containers, env, image, resources. Preserve replica count if manually scaled.
	existing.Spec.Template = desired.Spec.Template
	existing.Labels = desired.Labels
	return r.Update(ctx, existing)
}

// ── Status helpers ─────────────────────────────────────────────────────────────

// observePhase infers the agent phase from the owned Deployment's availability.
func (r *AgentReconciler) observePhase(
	ctx context.Context,
	deploy *appsv1.Deployment,
) (kivov1alpha1.AgentPhase, string, string) {
	existing := &appsv1.Deployment{}
	if err := r.Get(ctx, client.ObjectKeyFromObject(deploy), existing); err != nil {
		return kivov1alpha1.AgentPhaseProvisioning, "", ""
	}

	for _, c := range existing.Status.Conditions {
		if c.Type == appsv1.DeploymentAvailable && c.Status == corev1.ConditionTrue {
			// Try to surface the active pod name and IP for the status field
			podList := &corev1.PodList{}
			_ = r.List(ctx, podList,
				client.InNamespace(deploy.Namespace),
				client.MatchingLabels(deploy.Spec.Selector.MatchLabels),
			)
			podName := ""
			podIP := ""
			for _, p := range podList.Items {
				if p.Status.Phase == corev1.PodRunning {
					podName = p.Name
					podIP = p.Status.PodIP
					break
				}
			}
			return kivov1alpha1.AgentPhaseRunning, podName, podIP
		}
	}

	return kivov1alpha1.AgentPhaseProvisioning, "", ""
}

func (r *AgentReconciler) patchStatus(
	ctx context.Context,
	cr *kivov1alpha1.Agent,
	phase kivov1alpha1.AgentPhase,
	podName string,
	podIP string,
) error {
	now := metav1.Now()
	condType := "Ready"
	condStatus := metav1.ConditionFalse
	condReason := "Provisioning"
	condMsg := "Agent workload is being reconciled"

	if phase == kivov1alpha1.AgentPhaseRunning {
		condStatus = metav1.ConditionTrue
		condReason = "DeploymentAvailable"
		condMsg = "Agent Deployment is available and at least one pod is running"
	}

	condition := metav1.Condition{
		Type:               condType,
		Status:             condStatus,
		Reason:             condReason,
		Message:            condMsg,
		LastTransitionTime: now,
	}

	apimeta.SetStatusCondition(&cr.Status.Conditions, condition)
	cr.Status.Phase = phase
	cr.Status.PodName = podName
	cr.Status.PodIP = podIP
	cr.Status.ObservedGeneration = cr.Generation

	return r.Status().Update(ctx, cr)
}

func (r *AgentReconciler) failWith(
	ctx context.Context,
	cr *kivov1alpha1.Agent,
	reason string,
	err error,
) (ctrl.Result, error) {
	logger := log.FromContext(ctx)
	logger.Error(err, "reconciliation error", "reason", reason)

	_ = r.patchStatus(ctx, cr, kivov1alpha1.AgentPhaseFailed, "", "")
	_ = sync.PatchAgentStatus(ctx, r.APIBaseURL, cr.Name, "failed")

	return ctrl.Result{}, fmt.Errorf("%s: %w", reason, err)
}

// ── Owner reference helper ─────────────────────────────────────────────────────

func buildOwnerRef(cr *kivov1alpha1.Agent, scheme *runtime.Scheme) *metav1.OwnerReference {
	gvks, _, _ := scheme.ObjectKinds(cr)
	gvk := gvks[0]
	return &metav1.OwnerReference{
		APIVersion:         gvk.GroupVersion().String(),
		Kind:               gvk.Kind,
		Name:               cr.Name,
		UID:                cr.UID,
		Controller:         func() *bool { b := true; return &b }(),
		BlockOwnerDeletion: func() *bool { b := true; return &b }(),
	}
}

// ── Agent image resolution ─────────────────────────────────────────────────────

// resolveAgentImage returns the image ref and pull policy to use for agent pods.
//
// In local development (Tilt), it reads the "kivo-agent-image" ConfigMap in the
// kivo namespace. Tilt manages this ConfigMap and substitutes the "image" field
// with the actual tilt-tagged digest it has loaded into the k8s containerd store.
// This ensures agent pods always use an image that IS present in containerd.
//
// In production (no ConfigMap), falls back to r.AgentImage / r.AgentImagePullPolicy
// which are set via --agent-image and --agent-image-pull-policy flags.
func (r *AgentReconciler) resolveAgentImage(ctx context.Context) (image, pullPolicy string) {
	image = r.AgentImage
	pullPolicy = r.AgentImagePullPolicy
	if pullPolicy == "" {
		pullPolicy = "IfNotPresent"
	}

	var cm corev1.ConfigMap
	err := r.Get(ctx, types.NamespacedName{
		Namespace: "kivo",
		Name:      "kivo-agent-image",
	}, &cm)
	if err != nil {
		// ConfigMap not found (production or Tilt not running) — use flag values.
		return
	}
	if v := cm.Data["image"]; v != "" {
		image = v
	}
	if v := cm.Data["pullPolicy"]; v != "" {
		pullPolicy = v
	}
	return
}

// resolveConsumerImage returns the kivo-consumer sidecar image ref and pull policy.
//
// Follows the same pattern as resolveAgentImage: in local Tilt dev, reads the
// "kivo-consumer-image" ConfigMap (managed by Tilt, contains the tilt-tagged digest).
// In production, falls back to r.ConsumerImage / r.ConsumerImagePullPolicy flags.
func (r *AgentReconciler) resolveConsumerImage(ctx context.Context) (image, pullPolicy string) {
	image = r.ConsumerImage
	pullPolicy = r.ConsumerImagePullPolicy
	if pullPolicy == "" {
		pullPolicy = "IfNotPresent"
	}

	var cm corev1.ConfigMap
	err := r.Get(ctx, types.NamespacedName{
		Namespace: "kivo",
		Name:      "kivo-consumer-image",
	}, &cm)
	if err != nil {
		return
	}
	if v := cm.Data["image"]; v != "" {
		image = v
	}
	if v := cm.Data["pullPolicy"]; v != "" {
		pullPolicy = v
	}
	return
}

