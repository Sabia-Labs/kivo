package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/controller-runtime/pkg/scheme"
)

// GroupVersion is group version used to register these objects.
var GroupVersion = schema.GroupVersion{Group: "kivo.ai", Version: "v1alpha1"}

// SchemeBuilder is used to add functions to this group's scheme.
var SchemeBuilder = &scheme.Builder{GroupVersion: GroupVersion}

// AddToScheme adds the types in this group-version to the given scheme.
var AddToScheme = SchemeBuilder.AddToScheme

// ── Spec ──────────────────────────────────────────────────────────────────────

// AgentSpec defines the desired state of an Agent workload.
type AgentSpec struct {
	// Human-readable name of the agent (e.g. "Alice").
	AgentName string `json:"agentName"`

	// Agent role profile. Maps to /opt/kivo/profiles/{profile}/ inside the image.
	// +kubebuilder:validation:Enum=software_engineer;product_manager;software_architect;team_lead
	Profile string `json:"profile"`

	// Name of the human operator this agent works for.
	// +optional
	OperatorName string `json:"operatorName,omitempty"`

	// Name of the team this agent belongs to (e.g. "Acme Engineering").
	// Injected as TEAM_NAME env var and used in profile template files.
	// +optional
	TeamName string `json:"teamName,omitempty"`

	// ID of the team this agent belongs to.
	// Injected as TEAM_ID env var and used in profile template files.
	// +optional
	TeamId string `json:"teamId,omitempty"`

	// Name of the Secret in the same namespace containing all agent credentials.
	CredentialsSecretRef string `json:"credentialsSecretRef"`

	// LLM model configuration.
	// +optional
	Model *AgentModel `json:"model,omitempty"`

	// Compute resource requirements for the agent container.
	// +optional
	Resources *AgentResources `json:"resources,omitempty"`

	// Persistent volume configuration for the agent's state directory.
	// +optional
	Persistence *AgentPersistence `json:"persistence,omitempty"`

	// Image allows overriding the default kivo-agent image.
	// +optional
	Image *AgentImage `json:"image,omitempty"`
}

type AgentModel struct {
	// +kubebuilder:validation:Enum=openai;gemini;google
	Provider string `json:"provider,omitempty"`
	Name     string `json:"name,omitempty"`
}

type AgentResources struct {
	Requests map[string]string `json:"requests,omitempty"`
	Limits   map[string]string `json:"limits,omitempty"`
}

type AgentPersistence struct {
	// +kubebuilder:default="10Gi"
	Size             string `json:"size,omitempty"`
	StorageClassName string `json:"storageClassName,omitempty"`
}

type AgentImage struct {
	Repository string `json:"repository,omitempty"`
	Tag        string `json:"tag,omitempty"`
	// +kubebuilder:validation:Enum=Always;IfNotPresent;Never
	PullPolicy string `json:"pullPolicy,omitempty"`
}

// ── Status ─────────────────────────────────────────────────────────────────────

// AgentPhase represents the lifecycle phase of the agent workload.
// +kubebuilder:validation:Enum=Pending;Provisioning;Running;Failed
type AgentPhase string

const (
	AgentPhasePending      AgentPhase = "Pending"
	AgentPhaseProvisioning AgentPhase = "Provisioning"
	AgentPhaseRunning      AgentPhase = "Running"
	AgentPhaseFailed       AgentPhase = "Failed"
)

// AgentStatus defines the observed state of an Agent.
type AgentStatus struct {
	// Current lifecycle phase.
	Phase AgentPhase `json:"phase,omitempty"`

	// Name of the active Pod running the agent.
	// +optional
	PodName string `json:"podName,omitempty"`

	// Generation of the spec that was last successfully reconciled.
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`

	// Conditions representing granular reconciliation state.
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// ── Resource ───────────────────────────────────────────────────────────────────

// Agent is the Schema for the agents.kivo.ai API.
// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Phase",type="string",JSONPath=".status.phase"
// +kubebuilder:printcolumn:name="Profile",type="string",JSONPath=".spec.profile"
// +kubebuilder:printcolumn:name="Agent",type="string",JSONPath=".spec.agentName"
// +kubebuilder:printcolumn:name="Age",type="date",JSONPath=".metadata.creationTimestamp"
type Agent struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   AgentSpec   `json:"spec,omitempty"`
	Status AgentStatus `json:"status,omitempty"`
}

// DeepCopyObject implements runtime.Object.
func (a *Agent) DeepCopyObject() runtime.Object {
	out := new(Agent)
	a.DeepCopyInto(out)
	return out
}

func (a *Agent) DeepCopyInto(out *Agent) {
	*out = *a
	out.TypeMeta = a.TypeMeta
	a.ObjectMeta.DeepCopyInto(&out.ObjectMeta)
	a.Spec.DeepCopyInto(&out.Spec)
	a.Status.DeepCopyInto(&out.Status)
}

func (s *AgentSpec) DeepCopyInto(out *AgentSpec) {
	*out = *s
	if s.Model != nil {
		m := *s.Model
		out.Model = &m
	}
	if s.Resources != nil {
		r := new(AgentResources)
		if s.Resources.Requests != nil {
			r.Requests = make(map[string]string, len(s.Resources.Requests))
			for k, v := range s.Resources.Requests {
				r.Requests[k] = v
			}
		}
		if s.Resources.Limits != nil {
			r.Limits = make(map[string]string, len(s.Resources.Limits))
			for k, v := range s.Resources.Limits {
				r.Limits[k] = v
			}
		}
		out.Resources = r
	}
	if s.Persistence != nil {
		p := *s.Persistence
		out.Persistence = &p
	}
	if s.Image != nil {
		i := *s.Image
		out.Image = &i
	}
}

func (s *AgentStatus) DeepCopyInto(out *AgentStatus) {
	*out = *s
	if s.Conditions != nil {
		out.Conditions = make([]metav1.Condition, len(s.Conditions))
		copy(out.Conditions, s.Conditions)
	}
}

// AgentList contains a list of Agent resources.
// +kubebuilder:object:root=true
type AgentList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Agent `json:"items"`
}

func (al *AgentList) DeepCopyObject() runtime.Object {
	out := new(AgentList)
	*out = *al
	if al.Items != nil {
		out.Items = make([]Agent, len(al.Items))
		for i := range al.Items {
			al.Items[i].DeepCopyInto(&out.Items[i])
		}
	}
	return out
}

func init() {
	SchemeBuilder.Register(&Agent{}, &AgentList{})
}
