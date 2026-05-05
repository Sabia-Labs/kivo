package resources

import (
	kivov1alpha1 "github.com/ltreven/kivo/controller/api/v1alpha1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// StatePVC builds the PersistentVolumeClaim for the agent's OpenClaw state directory.
// Mount path: /home/node/.openclaw
//
// This PVC holds the agent's entire persistent state:
//   - openclaw.json (config)
//   - workspace/ (AGENTS.md, SOUL.md, etc. — seeded at first boot, then evolving)
//   - .bootstrapped (idempotency flag — prevents re-seeding on restart)
//   - mcp-packages/ (now pre-installed in image, but old agents may still use this)
//
// ownerRef → KivoAgent CR; K8s GC deletes the PVC when the CR is deleted.
// WARNING: PVC deletion is permanent. Agent state (including evolved profile files)
// will be lost. This is intentional — agent deletion = full decommission.
func StatePVC(cr *kivov1alpha1.Agent, ownerRef *metav1.OwnerReference) *corev1.PersistentVolumeClaim {
	size := "10Gi"
	if cr.Spec.Persistence != nil && cr.Spec.Persistence.Size != "" {
		size = cr.Spec.Persistence.Size
	}

	storageClass := ""
	if cr.Spec.Persistence != nil {
		storageClass = cr.Spec.Persistence.StorageClassName
	}

	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cr.Name + "-state",
			Namespace: cr.Namespace,
			Labels:    agentLabels(cr),
			OwnerReferences: []metav1.OwnerReference{*ownerRef},
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{
				corev1.ReadWriteOnce,
			},
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse(size),
				},
			},
		},
	}

	if storageClass != "" {
		pvc.Spec.StorageClassName = &storageClass
	}

	return pvc
}

// agentLabels returns the standard label set applied to all resources
// owned by a KivoAgent CR. Centralised here to avoid repetition.
func agentLabels(cr *kivov1alpha1.Agent) map[string]string {
	return map[string]string{
		"app.kubernetes.io/managed-by": "kivo-agent-controller",
		"app.kubernetes.io/name":       "kivo-agent",
		"app.kubernetes.io/instance":   cr.Name,
		"kivo.ai/agent-id":            cr.Name,
		"kivo.ai/profile":             cr.Spec.Profile,
	}
}
