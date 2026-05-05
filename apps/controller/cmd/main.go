package main

import (
	"flag"
	"os"

	kivov1alpha1 "github.com/ltreven/kivo/controller/api/v1alpha1"
	"github.com/ltreven/kivo/controller/internal/controller"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/healthz"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"
)

var scheme = runtime.NewScheme()

func init() {
	utilruntime.Must(clientgoscheme.AddToScheme(scheme))
	utilruntime.Must(kivov1alpha1.AddToScheme(scheme))
	utilruntime.Must(appsv1.AddToScheme(scheme))
	utilruntime.Must(corev1.AddToScheme(scheme))
}

func main() {
	var (
		metricsAddr             string
		probeAddr               string
		leaderElectionNS        string
		apiBaseURL              string
		agentImage              string
		agentImagePullPolicy    string
		consumerImage           string
		consumerImagePullPolicy string
	)

	flag.StringVar(&metricsAddr,             "metrics-bind-address",        ":8080",                                "Address for Prometheus metrics endpoint")
	flag.StringVar(&probeAddr,               "health-probe-bind-address",   ":8081",                                "Address for health/readiness probes")
	flag.StringVar(&leaderElectionNS,        "leader-election-namespace",   "kivo",                                "Namespace for leader election Lease object")
	flag.StringVar(&apiBaseURL,              "api-base-url",                "http://kivo-api:4000",                "Internal URL of the Kivo API")
	flag.StringVar(&agentImage,              "agent-image",                 "ghcr.io/ltreven/kivo-agent:latest",   "Full image reference for the kivo-agent (repo:tag)")
	flag.StringVar(&agentImagePullPolicy,    "agent-image-pull-policy",     "IfNotPresent",                         "ImagePullPolicy for the kivo-agent containers")
	flag.StringVar(&consumerImage,           "consumer-image",              "ghcr.io/ltreven/kivo-consumer:latest", "Full image reference for the kivo-consumer sidecar")
	flag.StringVar(&consumerImagePullPolicy, "consumer-image-pull-policy",  "IfNotPresent",                         "ImagePullPolicy for the kivo-consumer sidecar")

	opts := zap.Options{Development: os.Getenv("DEBUG") == "true"}
	opts.BindFlags(flag.CommandLine)
	flag.Parse()

	ctrl.SetLogger(zap.New(zap.UseFlagOptions(&opts)))
	setupLog := ctrl.Log.WithName("setup")

	mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
		Scheme: scheme,
		Metrics: metricsserver.Options{
			BindAddress: metricsAddr,
		},
		HealthProbeBindAddress: probeAddr,

		// ── Leader Election ─────────────────────────────────────────────────────
		// Ensures only one controller replica reconciles at a time.
		// The Lease is stored in the kivo namespace.
		LeaderElection:          true,
		LeaderElectionID:        "kivo-agent-controller.kivo.ai",
		LeaderElectionNamespace: leaderElectionNS,
	})
	if err != nil {
		setupLog.Error(err, "unable to start manager")
		os.Exit(1)
	}

	if err = (&controller.AgentReconciler{
		Client:                  mgr.GetClient(),
		Scheme:                  mgr.GetScheme(),
		APIBaseURL:              apiBaseURL,
		AgentImage:              agentImage,
		AgentImagePullPolicy:    agentImagePullPolicy,
		ConsumerImage:           consumerImage,
		ConsumerImagePullPolicy: consumerImagePullPolicy,
	}).SetupWithManager(mgr); err != nil {
		setupLog.Error(err, "unable to create controller", "controller", "Agent")
		os.Exit(1)
	}

	// Health / readiness probes
	if err := mgr.AddHealthzCheck("healthz", healthz.Ping); err != nil {
		setupLog.Error(err, "unable to set up health check")
		os.Exit(1)
	}
	if err := mgr.AddReadyzCheck("readyz", healthz.Ping); err != nil {
		setupLog.Error(err, "unable to set up ready check")
		os.Exit(1)
	}

	setupLog.Info("starting Kivo Agent Controller", "api-base-url", apiBaseURL)
	if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
		setupLog.Error(err, "problem running manager")
		os.Exit(1)
	}
}
