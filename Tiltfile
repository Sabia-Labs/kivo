# ─────────────────────────────────────────────────────────────────────────────
# Kivo — Tiltfile
#
# Usage:
#   tilt up             — start everything
#   tilt down           — stop everything
#   tilt up kivo-api   — start only the API (and its dependencies)
#
# Prerequisites:
#   - Docker Desktop with Kubernetes enabled
#   - ingress-nginx controller (installed automatically below)
#   - helm 3.x on PATH
#   - tilt 0.33+ on PATH
#
# Local settings (registry, etc.) can be overridden in tilt-settings.yaml
# ─────────────────────────────────────────────────────────────────────────────

# ── Load local developer settings (optional, gitignored) ─────────────────────
settings = read_yaml("tilt-settings.yaml", default={})

# ── Load platform credentials from .env (gitignored, never committed) ────────────
# Copy .env.example to .env and fill in real values.
dotenv = str(read_file(".env", default="")).splitlines()
def _parse_dotenv(lines):
  env = {}
  for line in lines:
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    k, _, v = line.partition("=")
    env[k.strip()] = v.strip()
  return env
_env = _parse_dotenv(dotenv)

PLATFORM_OPENAI_KEY    = _env.get("PLATFORM_OPENAI_API_KEY",  "")
PLATFORM_MODEL_PROVIDER = _env.get("PLATFORM_MODEL_PROVIDER", "openai")
PLATFORM_MODEL_NAME     = _env.get("PLATFORM_MODEL_NAME",    "gpt-5.4")

# ── Configuration ─────────────────────────────────────────────────────────────
NAMESPACE       = "kivo"
ADMIN_NAMESPACE = "kivo-admin"
HELM_CHART      = "charts/kivo"
VALUES_LOCAL   = "charts/kivo/values-local.yaml"
API_IMAGE        = settings.get("api_image",        "kivo/api")
ADMIN_API_IMAGE  = settings.get("admin_api_image",  "kivo/admin-api")
KIVO_WEB_IMAGE  = settings.get("kivo_web_image",  "kivo/web")
ADMIN_WEB_IMAGE  = settings.get("admin_web_image",  "kivo/admin-web")
AGENT_IMAGE      = settings.get("agent_image",      "kivo/agent:local")
CONSUMER_IMAGE   = settings.get("consumer_image",   "kivo/consumer:local")
CONTROLLER_IMAGE = settings.get("controller_image", "kivo/controller")
TILT_HOST      = settings.get("host", "kivo.localhost")

# ── 1. Install ingress-nginx via Helm (only if not already present) ────────────
load('ext://helm_resource', 'helm_resource', 'helm_repo')

helm_repo(
  'ingress-nginx-repo',
  'https://kubernetes.github.io/ingress-nginx',
  labels=['infra'],
)

helm_resource(
  'ingress-nginx',
  'ingress-nginx-repo/ingress-nginx',
  namespace='ingress-nginx',
  flags=[
    '--create-namespace',
    # Docker Desktop natively supports LoadBalancer — binds to localhost:80 / localhost:443
    '--set', 'controller.service.type=LoadBalancer',
  ],
  resource_deps=[],
  labels=['infra'],
)

# ── 1b. RabbitMQ Cluster Operator ────────────────────────────────────────────
# Installed via the official manifest (kubectl apply) from GitHub releases.
# This is the recommended approach from the RabbitMQ docs.
# The Operator watches RabbitmqCluster CRs and manages the StatefulSet lifecycle.
#
# We use local_resource instead of helm_resource because the public Helm chart
# URL is frequently unavailable. The manifest includes the CRD + RBAC + Deployment.
local_resource(
  'rabbitmq-operator',
  cmd='kubectl apply -f "https://github.com/rabbitmq/cluster-operator/releases/latest/download/cluster-operator.yml"',
  labels=['infra'],
  deps=[],
)

# ── 2. Ensure the kivo namespace exists ─────────────────────────────────────
# For local mode, all credentials are injected via values-local.yaml (no Secret needed).
# DATABASE_URL is built from embedded PostgreSQL, JWT_SECRET is inlined as an env var.

local_resource(
  'ensure-namespace',
  cmd='kubectl create namespace kivo --dry-run=client -o yaml | kubectl apply -f - && kubectl create namespace kivo-admin --dry-run=client -o yaml | kubectl apply -f -',
  labels=['setup'],
)

# ── 2b. Run DB migrations after PostgreSQL is ready ───────────────────────────
# Pipes all migration SQL files into the PostgreSQL pod.
# ON_ERROR_STOP=0 makes it idempotent ("already exists" errors are harmless).
# Tilt re-runs this step whenever a new .sql file is added to migrations/.
local_resource(
  'db-migrate',
  cmd='cat apps/kivo-api/migrations/[0-9]*.sql | kubectl exec -i -n kivo kivo-postgresql-0 -- psql -U kivo -d kivo -v ON_ERROR_STOP=0 2>&1 | grep -vE "already exists|^$" | grep -E "^(ERROR|FATAL)" || echo "✓ App DB migrations applied"',
  resource_deps=['kivo-postgresql'],
  deps=['apps/kivo-api/migrations'],
  labels=['setup'],
)

local_resource(
  'admin-db-migrate',
  cmd='kubectl exec -i -n kivo kivo-postgresql-0 -- psql -U kivo -d postgres -c "CREATE DATABASE kivo_admin;" 2>/dev/null || true && cat apps/admin-api/migrations/[0-9]*.sql | kubectl exec -i -n kivo kivo-postgresql-0 -- psql -U kivo -d kivo_admin -v ON_ERROR_STOP=0 2>&1 | grep -vE "already exists|^$" | grep -E "^(ERROR|FATAL)" || echo "✓ Admin DB migrations applied"',
  resource_deps=['kivo-postgresql'],
  deps=['apps/admin-api/migrations'],
  labels=['setup'],
)

local_resource(
  'admin-db-seed',
  cmd='cd apps/admin-api && npm run db:seed',
  resource_deps=['admin-db-migrate'],
  labels=['setup'],
)

local_resource(
  'app-db-seed',
  cmd='cd apps/kivo-api && npm run db:seed',
  resource_deps=['db-migrate', 'admin-db-seed'],
  labels=['setup'],
)

# ── 3. Build Kivo API image ──────────────────────────────────────────────────
docker_build(
  API_IMAGE,
  context='apps/kivo-api',
  dockerfile='apps/kivo-api/Dockerfile',
  # Only-changed files trigger a rebuild (faster)
  ignore=[
    'node_modules',
    'dist',
    '.env',
    '*.md',
  ],
  # Note: live_update is disabled — the container runs as non-root (kivo user)
  # which cannot write to /app/src. Tilt does a fast Docker layer-cache rebuild instead.
)

docker_build(
  ADMIN_API_IMAGE,
  context='apps/admin-api',
  dockerfile='apps/admin-api/Dockerfile',
  ignore=[
    'node_modules',
    'dist',
    '.env',
    '*.md',
  ],
)

# ── 4a. Build Kivo Web image ─────────────────────────────────────────────────
docker_build(
  KIVO_WEB_IMAGE,
  context='apps/kivo-web',
  dockerfile='apps/kivo-web/Dockerfile',
  build_args={
    'NEXT_PUBLIC_API_URL': '/api',
    'API_INTERNAL_URL': 'http://kivo-api:4000',
  },
  ignore=['node_modules', '.next', '*.md'],
)

# ── 4b. Build Admin Web image ─────────────────────────────────────────────────
docker_build(
  ADMIN_WEB_IMAGE,
  context='apps/admin-web',
  dockerfile='apps/kivo-web/Dockerfile', # Reuse same generic Dockerfile
  build_args={
    'NEXT_PUBLIC_API_URL': '/admin-api',
    'API_INTERNAL_URL': 'http://kivo-admin-api.kivo-admin:4001',
  },
  ignore=['node_modules', '.next', '*.md'],
)

# ── 5a. Build kivo-agent image ──────────────────────────────────────────────
# Root cause of stale-image problem:
#   `docker build` writes to containerd's "default" namespace.
#   Docker Desktop Kubernetes reads from the "k8s.io" namespace.
#   These are separate — plain docker build is invisible to Kubernetes.
#
# Tilt's docker_build *does* load images into k8s.io via its cluster connector,
# but only for images it considers "used" in a k8s resource (container image field).
#
# Solution:
#   1. docker_build so Tilt builds and loads the image into k8s.io containerd.
#   2. A 0-replica Deployment ("preloader") with kivo/agent:local — Tilt
#      substitutes this with the tilt-tagged digest and loads it into k8s.io.
#   3. local_resource reads the substituted tag from the preloader and patches
#      kivo-agent-image ConfigMap → controller uses the exact loaded digest.
docker_build(
  AGENT_IMAGE,
  context='apps/agents',
  dockerfile='apps/agents/Dockerfile',
)

# 1-replica preloader: forces Tilt to load kivo/agent into k8s.io containerd.
# replicas:0 makes Tilt substitute the tag but does NOT trigger k8s.io loading
# (no pod needs to run). With replicas:1 + a trivial sleep command, Tilt sees
# a real pod that needs the image and loads it into k8s.io.
# pullPolicy: IfNotPresent allows Docker Desktop's bridge to serve the image
# on first pull if k8s.io hasn't synced yet.
k8s_yaml(blob("""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kivo-agent-preloader
  namespace: kivo
  labels:
    app.kubernetes.io/managed-by: tilt
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kivo-agent-preloader
  template:
    metadata:
      labels:
        app: kivo-agent-preloader
    spec:
      containers:
      - name: agent-preloader
        image: {image}
        imagePullPolicy: IfNotPresent
        command: ["/bin/sh", "-c", "while true; do sleep 3600; done"]
""".format(image=AGENT_IMAGE)))

k8s_resource('kivo-agent-preloader', pod_readiness='ignore', labels=['images'])

# Sync the tilt-substituted image tag into the ConfigMap the controller reads.
local_resource(
  'kivo-agent-configmap-sync',
  cmd="""
    IMG=$(kubectl get deployment kivo-agent-preloader -n kivo \\
      -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "")
    if [ -z "$IMG" ]; then echo "==> preloader not ready, skipping"; exit 0; fi
    kubectl patch configmap kivo-agent-image -n kivo \\
      -p '{"data":{"image":"'"$IMG"'","pullPolicy":"IfNotPresent"}}'
    echo "==> kivo-agent-image ConfigMap => $IMG"
  """,
  resource_deps=['kivo-agent-preloader'],
  labels=['images'],
)

# Initial placeholder ConfigMap — value is overwritten by kivo-agent-configmap-sync.
k8s_yaml(blob("""
apiVersion: v1
kind: ConfigMap
metadata:
  name: kivo-agent-image
  namespace: kivo
  labels:
    app.kubernetes.io/managed-by: tilt
data:
  image: "{image}"
  pullPolicy: "IfNotPresent"
""".format(image=AGENT_IMAGE)))



# ── 5b. Build kivo-consumer image ────────────────────────────────────────────────
# The same pattern as kivo-agent: a 1-replica preloader Deployment forces Tilt
# to build and load the image into k8s.io containerd (Docker Desktop Kubernetes).
# Tilt only builds images it sees in a k8s container spec — a ConfigMap value alone
# is not enough. The preloader is a stub pod that keeps the image reference alive.
docker_build(
  CONSUMER_IMAGE,
  context='apps/consumer',
  dockerfile='apps/consumer/Dockerfile',
  ignore=['node_modules', 'dist'],
)

# Preloader: forces Tilt to load kivo/consumer:local into k8s.io containerd.
k8s_yaml(blob("""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kivo-consumer-preloader
  namespace: kivo
  labels:
    app.kubernetes.io/managed-by: tilt
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kivo-consumer-preloader
  template:
    metadata:
      labels:
        app: kivo-consumer-preloader
    spec:
      containers:
      - name: consumer-preloader
        image: {image}
        imagePullPolicy: Never
        command: ["/bin/sh", "-c", "while true; do sleep 3600; done"]
""".format(image=CONSUMER_IMAGE)))

k8s_resource('kivo-consumer-preloader', pod_readiness='ignore', labels=['images'])

local_resource(
  'kivo-consumer-configmap-sync',
  cmd="""
    IMG=$(kubectl get deployment kivo-consumer-preloader -n kivo \\
      -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "")
    if [ -z "$IMG" ]; then echo "==> preloader not ready, skipping"; exit 0; fi
    kubectl patch configmap kivo-consumer-image -n kivo \\
      -p '{"data":{"image":"'"$IMG"'","pullPolicy":"IfNotPresent"}}'
    echo "==> kivo-consumer-image ConfigMap => $IMG"
  """,
  resource_deps=['kivo-consumer-preloader'],
  labels=['images'],
)

# kivo-consumer-image ConfigMap — enables the RabbitMQ↔openclaw sidecar.
# image is set to CONSUMER_IMAGE to activate sidecar injection in agent pods.
# The controller reads this ConfigMap and attaches the sidecar container to each
# KivoAgent pod when provisioning. Set image: "" to disable sidecar injection.
k8s_yaml(blob("""
apiVersion: v1
kind: ConfigMap
metadata:
  name: kivo-consumer-image
  namespace: kivo
  labels:
    app.kubernetes.io/managed-by: tilt
data:
  image: "{image}"
  pullPolicy: "Never"
""".format(image=CONSUMER_IMAGE)))


# ── RabbitmqCluster CR ───────────────────────────────────────────────────────────────
# Applied DIRECTLY here (not in Helm) because Tilt can't load CRD-backed resources
# from helm template before the Operator installs the CRD.
# Tilt sees this as a known resource named 'kivo-rabbit' and applies it in the
# correct order via resource_deps=['rabbitmq-operator'].
k8s_yaml(blob("""
apiVersion: rabbitmq.com/v1beta1
kind: RabbitmqCluster
metadata:
  name: kivo-rabbit
  namespace: infra-messaging
  labels:
    app.kubernetes.io/managed-by: tilt
    kivo.ai/component: message-bus
spec:
  replicas: 1
  persistence:
    storage: 2Gi
  rabbitmq:
    additionalPlugins:
      - rabbitmq_management
      - rabbitmq_prometheus
    additionalConfig: |
      default_vhost = /
      log.console = true
      default_user = admin
      default_pass = kivo_rabbit_local
  # Pin to a stable management image — avoids EOF errors when pulling bleeding-edge tags.
  # The management plugin tag is required for the HTTP API used by kivo-api.
  image: rabbitmq:3.13-management
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: "300m"
      memory: 1Gi
  override:
    statefulSet:
      spec:
        template:
          spec:
            containers:
              - name: rabbitmq
                startupProbe:
                  exec:
                    command:
                      - /bin/bash
                      - "-c"
                      - "rabbitmqctl eval 'rabbit_nodes:reached_target_cluster_size().' | grep -q '^true$'"
                  initialDelaySeconds: 10
                  periodSeconds: 10
                  timeoutSeconds: 15
                  failureThreshold: 60
                  successThreshold: 1
                readinessProbe:
                  tcpSocket:
                    port: amqp
                  initialDelaySeconds: 20
                  periodSeconds: 10
                  timeoutSeconds: 5
                  failureThreshold: 6
"""))


# ── 5b. Build kivo-controller (Go) ─────────────────────────────────────────
docker_build(
  CONTROLLER_IMAGE,
  context='apps/controller',
  dockerfile='apps/controller/Dockerfile',
  ignore=['vendor'],
)

# ── 5. Deploy the kivo Helm chart ────────────────────────────────────────────
# Note: Tilt passes --include-crds to helm template automatically, so CRDs in
# charts/kivo/crds/ (KivoAgent CRD) are applied as part of this step.
# No separate kubectl apply step is needed, even on a zero-km cluster.
k8s_yaml(
  helm(
    HELM_CHART,
    name='kivo',
    namespace=NAMESPACE,
    values=[VALUES_LOCAL],
    set=[
      'kivoApi.image.repository=' + API_IMAGE,
      'kivoApi.image.tag=local',
      'adminApi.image.repository=' + ADMIN_API_IMAGE,
      'adminApi.image.tag=local',
      'kivoWeb.image.repository=' + KIVO_WEB_IMAGE,
      'kivoWeb.image.tag=local',
      'adminWeb.image.repository=' + ADMIN_WEB_IMAGE,
      'adminWeb.image.tag=local',
      'controller.image.repository=' + CONTROLLER_IMAGE,
      'controller.image.tag=local',
      'ingress.host=' + TILT_HOST,
      # Platform AI credentials — read from .env (gitignored)
      'kivoApi.env.PLATFORM_OPENAI_API_KEY=' + PLATFORM_OPENAI_KEY,
      'kivoApi.env.PLATFORM_MODEL_PROVIDER=' + PLATFORM_MODEL_PROVIDER,
      'kivoApi.env.PLATFORM_MODEL_NAME=' + PLATFORM_MODEL_NAME,
      'adminApi.env.KIVO_API_INTERNAL_URL=http://kivo-api.kivo:4000',
    ],
  )
)

# ── 6. Resource configuration ─────────────────────────────────────────────────

# PostgreSQL must be ready before the API starts
k8s_resource(
  'kivo-postgresql',
  labels=['database'],
  port_forwards=['5432:5432'],
)

# RabbitMQ cluster — the RabbitmqCluster CR is a non-workload CRD resource.
# Tilt requires the objects= syntax to reference it by name.
# Port-forwards to the management UI are done separately by targeting the
# Service created by the Operator (kivo-rabbit-management, port 15672).
k8s_resource(
  objects=['kivo-rabbit:RabbitmqCluster:infra-messaging'],
  new_name='kivo-rabbit',
  resource_deps=['rabbitmq-operator'],
  labels=['infra'],
)

# API depends on PostgreSQL only at startup; RabbitMQ connection is lazy in the app
k8s_resource(
  'kivo-api',
  resource_deps=['kivo-postgresql', 'db-migrate', 'ensure-namespace'],
  labels=['app'],
  port_forwards=['4000:4000'],
  links=[
    link('http://localhost:4000/health', 'API Health'),
  ],
)

k8s_resource(
  'kivo-admin-api',
  resource_deps=['kivo-postgresql', 'admin-db-migrate', 'ensure-namespace'],
  labels=['app'],
  port_forwards=['4001:4001'],
  extra_pod_selectors=[
    {'app.kubernetes.io/name': 'kivo-admin-api'},
  ],
  links=[
    link('http://localhost:4001/health', 'Admin API Health'),
  ],
)

# Web depends on the API
k8s_resource(
  'kivo-web',
  resource_deps=['kivo-api'],
  labels=['app'],
  port_forwards=['3000:3000'],
  links=[
    link('http://localhost:3000', 'Kivo Web (Client Portal)'),
  ],
)

k8s_resource(
  'kivo-admin-web',
  resource_deps=['kivo-admin-api'],
  labels=['app'],
  port_forwards=['3001:3001'],
  extra_pod_selectors=[
    {'app.kubernetes.io/name': 'kivo-admin-web'},
  ],
  links=[
    link('http://localhost:3001', 'Admin/Marketing Portal'),
  ],
)

k8s_resource(
  'ingress-nginx',
  labels=['infra'],
  links=[
    link('http://' + TILT_HOST, 'Ingress entry point'),
  ],
)

# ── 7. Convenience local resources ───────────────────────────────────────────

local_resource(
  'helm-lint',
  cmd='helm lint charts/kivo -f charts/kivo/values-local.yaml',
  deps=['charts/kivo'],
  labels=['validation'],
  auto_init=True,
  trigger_mode=TRIGGER_MODE_MANUAL,
)

local_resource(
  'kivo-api-typecheck',
  cmd='cd apps/kivo-api && npx tsc --noEmit',
  deps=['apps/kivo-api/src', 'apps/kivo-api/tsconfig.json'],
  labels=['validation'],
  auto_init=False,
)

local_resource(
  'kivo-web-typecheck',
  cmd='cd apps/kivo-web && npx tsc --noEmit',
  deps=['apps/kivo-web/app', 'apps/kivo-web/components', 'apps/kivo-web/tsconfig.json'],
  labels=['validation'],
  auto_init=False,
)
