package resources // rebuild for cleanup fix v4

import (
	_ "embed"

	kivov1alpha1 "github.com/ltreven/kivo/controller/api/v1alpha1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// bootstrapScript is the agent bootstrap.sh, embedded at controller build time.
// This means: updating bootstrap.sh only requires rebuilding the controller
// (Go binary, fast), not the heavy agent Docker image.
//
// The script is the single source of truth — both the controller (ConfigMap)
// and the agent image copy at /opt/kivo/bootstrap.sh should stay in sync.
//
//go:embed bootstrap.sh
var bootstrapScript string

// BootstrapConfigMap builds the ConfigMap that holds bootstrap.sh.
// It is mounted into the initContainer at /bootstrap/bootstrap.sh.
//
// By embedding the script here, the controller always injects the latest
// bootstrap.sh on every reconcile — no image rebuild needed for script updates.
//
// ownerRef ties this ConfigMap's lifecycle to the KivoAgent CR —
// when the CR is deleted, K8s GC deletes this ConfigMap automatically.
func BootstrapConfigMap(cr *kivov1alpha1.Agent, ownerRef *metav1.OwnerReference) *corev1.ConfigMap {
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:            cr.Name + "-bootstrap",
			Namespace:       cr.Namespace,
			Labels:          agentLabels(cr),
			OwnerReferences: []metav1.OwnerReference{*ownerRef},
		},
		Data: map[string]string{
			"bootstrap.sh": bootstrapScript,
		},
	}
}
