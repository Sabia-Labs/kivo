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

OPENAI_KEY    = _env.get("OPENAI_API_KEY",  "")
MODEL_PROVIDER = _env.get("MODEL_PROVIDER", "openai")
MODEL_NAME     = _env.get("MODEL_NAME",    "gpt-5.4")

FEATURE_FLAG_LANGCHAIN = _env.get("FEATURE_FLAG_LANGCHAIN", "false")
PLANNER_PROVIDER       = _env.get("PLANNER_PROVIDER", "")
PLANNER_MODEL          = _env.get("PLANNER_MODEL", "")
PLANNER_API_KEY        = _env.get("PLANNER_API_KEY", "")
EXECUTOR_PROVIDER      = _env.get("EXECUTOR_PROVIDER", "")
EXECUTOR_MODEL         = _env.get("EXECUTOR_MODEL", "")
EXECUTOR_API_KEY       = _env.get("EXECUTOR_API_KEY", "")
ORCHESTRATOR_PROVIDER  = _env.get("ORCHESTRATOR_PROVIDER", "")
ORCHESTRATOR_MODEL     = _env.get("ORCHESTRATOR_MODEL", "")
ORCHESTRATOR_API_KEY   = _env.get("ORCHESTRATOR_API_KEY", "")

GOOGLE_CLIENT_ID        = _env.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET    = _env.get("GOOGLE_CLIENT_SECRET", "")

# ── Configuration ─────────────────────────────────────────────────────────────
NAMESPACE       = "kivo"
HELM_CHART      = "charts/kivo"
VALUES_LOCAL   = "charts/kivo/values-local.yaml"
API_IMAGE        = settings.get("api_image",        "kivo/api")
KIVO_WEB_IMAGE  = settings.get("kivo_web_image",  "kivo/web")
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

# ── 2. Ensure the kivo namespace exists ─────────────────────────────────────
# For local mode, all credentials are injected via values-local.yaml (no Secret needed).
# DATABASE_URL is built from embedded PostgreSQL, JWT_SECRET is inlined as an env var.

local_resource(
  'ensure-namespace',
  cmd='kubectl create namespace kivo --dry-run=client -o yaml | kubectl apply -f -',
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
  'app-db-seed',
  cmd='cd apps/kivo-api && npm run db:seed',
  resource_deps=['db-migrate'],
  labels=['setup'],
)

# ── 3. Build Kivo API image ──────────────────────────────────────────────────
docker_build(
  API_IMAGE,
  context='.',
  dockerfile='apps/kivo-api/Dockerfile',
  # Only-changed files trigger a rebuild (faster)
  ignore=[
    '**/node_modules',
    '**/dist',
    '**/.env',
    '**/.next',
  ],
  # Note: live_update is disabled — the container runs as non-root (kivo user)
  # which cannot write to /app/src. Tilt does a fast Docker layer-cache rebuild instead.
)



# ── 4a. Build Kivo Web image ─────────────────────────────────────────────────
docker_build(
  KIVO_WEB_IMAGE,
  context='apps/kivo-web',
  dockerfile='apps/kivo-web/Dockerfile',
  build_args={
    'NEXT_PUBLIC_API_URL': 'http://localhost:4000',
    'API_INTERNAL_URL': 'http://kivo-api:4000',
  },
  ignore=['node_modules', '.next', '*.md'],
)



# ── 5a. Build kivo-agent image ──────────────────────────────────────────────
docker_build(
  AGENT_IMAGE,
  context='apps/agents',
  dockerfile='apps/agents/Dockerfile',
)

# 1-replica preloader: forces Tilt to load kivo/agent into k8s.io containerd.
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

# kivo-consumer-image ConfigMap — enables the HTTP Push sidecar.
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


# ── 5b. Build kivo-controller (Go) ─────────────────────────────────────────
docker_build(
  CONTROLLER_IMAGE,
  context='apps/controller',
  dockerfile='apps/controller/Dockerfile',
  ignore=['vendor'],
)

# ── 5. Deploy the kivo Helm chart ────────────────────────────────────────────
k8s_yaml(
  helm(
    HELM_CHART,
    name='kivo',
    namespace=NAMESPACE,
    values=[VALUES_LOCAL],
    set=[
      'kivoApi.image.repository=' + API_IMAGE,
      'kivoApi.image.tag=local',
      'kivoWeb.image.repository=' + KIVO_WEB_IMAGE,
      'kivoWeb.image.tag=local',
      'kivoWeb.env.SITE_URL=http://' + TILT_HOST,
      'kivoWeb.env.NEXT_PUBLIC_SITE_URL=http://' + TILT_HOST,
      'controller.image.repository=' + CONTROLLER_IMAGE,
      'controller.image.tag=local',
      'ingress.host=' + TILT_HOST,
      # Platform AI credentials — read from .env (gitignored)
      'kivoApi.env.OPENAI_API_KEY=' + OPENAI_KEY,
      'kivoApi.env.MODEL_PROVIDER=' + MODEL_PROVIDER,
      'kivoApi.env.MODEL_NAME=' + MODEL_NAME,
      'kivoApi.env.FEATURE_FLAG_LANGCHAIN=' + FEATURE_FLAG_LANGCHAIN,
      'kivoApi.env.PLANNER_PROVIDER=' + PLANNER_PROVIDER,
      'kivoApi.env.PLANNER_MODEL=' + PLANNER_MODEL,
      'kivoApi.env.PLANNER_API_KEY=' + PLANNER_API_KEY,
      'kivoApi.env.EXECUTOR_PROVIDER=' + EXECUTOR_PROVIDER,
      'kivoApi.env.EXECUTOR_MODEL=' + EXECUTOR_MODEL,
      'kivoApi.env.EXECUTOR_API_KEY=' + EXECUTOR_API_KEY,
      'kivoApi.env.ORCHESTRATOR_PROVIDER=' + ORCHESTRATOR_PROVIDER,
      'kivoApi.env.ORCHESTRATOR_MODEL=' + ORCHESTRATOR_MODEL,
      'kivoApi.env.ORCHESTRATOR_API_KEY=' + ORCHESTRATOR_API_KEY,
      'kivoApi.env.GOOGLE_CLIENT_ID=' + GOOGLE_CLIENT_ID,
      'kivoApi.env.GOOGLE_CLIENT_SECRET=' + GOOGLE_CLIENT_SECRET,
      'controller.agentImage=' + AGENT_IMAGE,
      'controller.consumerImage=' + CONSUMER_IMAGE,
      'controller.agentImagePullPolicy=IfNotPresent',
      'controller.consumerImagePullPolicy=IfNotPresent',
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

k8s_resource(
  'kivo-api',
  resource_deps=['kivo-postgresql', 'db-migrate', 'ensure-namespace'],
  labels=['app'],
  port_forwards=['4000:4000'],
  links=[
    link('http://localhost:4000/health', 'API Health'),
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
  'kivo-agent-controller',
  resource_deps=['kivo-api', 'ensure-namespace'],
  labels=['app'],
  extra_pod_selectors=[
    {'app.kubernetes.io/name': 'kivo-agent-controller'},
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
