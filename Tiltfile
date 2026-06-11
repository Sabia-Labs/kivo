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

PLATFORM_OPENAI_API_KEY    = _env.get("PLATFORM_OPENAI_API_KEY",  "")
PLATFORM_GEMINI_API_KEY    = _env.get("PLATFORM_GEMINI_API_KEY",  "")
PLATFORM_DEEPSEEK_API_KEY  = _env.get("PLATFORM_DEEPSEEK_API_KEY",  "")
FEATURE_FLAG_LANGCHAIN = _env.get("FEATURE_FLAG_LANGCHAIN", "false")

GOOGLE_CLIENT_ID        = _env.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET    = _env.get("GOOGLE_CLIENT_SECRET", "")

# ── Configuration ─────────────────────────────────────────────────────────────
NAMESPACE       = "kivo"
HELM_CHART      = "charts/kivo"
VALUES_LOCAL   = "charts/kivo/values-local.yaml"
API_IMAGE        = settings.get("api_image",        "kivo/api")
KIVO_WEB_IMAGE  = settings.get("kivo_web_image",  "kivo/web")
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
  context='.',
  dockerfile='apps/kivo-web/Dockerfile',
  build_args={
    'NEXT_PUBLIC_API_URL': 'http://localhost:4000',
    'API_INTERNAL_URL': 'http://kivo-api:4000',
  },
  ignore=['node_modules', '.next', '*.md'],
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
      'ingress.host=' + TILT_HOST,
      # Platform AI credentials — read from .env (gitignored)
      'kivoApi.env.PLATFORM_OPENAI_API_KEY=' + PLATFORM_OPENAI_API_KEY,
      'kivoApi.env.PLATFORM_GEMINI_API_KEY=' + PLATFORM_GEMINI_API_KEY,
      'kivoApi.env.PLATFORM_DEEPSEEK_API_KEY=' + PLATFORM_DEEPSEEK_API_KEY,
      'kivoApi.env.FEATURE_FLAG_LANGCHAIN=' + FEATURE_FLAG_LANGCHAIN,
      'kivoApi.env.GOOGLE_CLIENT_ID=' + GOOGLE_CLIENT_ID,
      'kivoApi.env.GOOGLE_CLIENT_SECRET=' + GOOGLE_CLIENT_SECRET,
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
