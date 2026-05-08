# Kivo

**Kivo**, by **Sabia Labs**, is a platform for deploying and operating autonomous AI agent teams with world-class management discipline — structured roles, clear ownership, governed workflows, and real-time health visibility.

> *"Kivo brings world-class team management discipline to autonomous AI agents — so your agent teams run like a well-managed human organization, at AI speed."*

Whether you are building software, running customer support, or coordinating any other team-based function, Kivo gives you the infrastructure to deploy autonomous agents that operate like a well-managed organization.

---

## Architecture overview

```
kivo/
├── apps/
│   ├── kivo-web/        # Application Plane — Client Portal (port 3000)
│   ├── admin-web/        # Control Plane — Marketing & Admin Portal (port 3001)
│   ├── kivo-api/        # Application Plane — Teams & Tasks (port 4000)
│   ├── admin-api/        # Control Plane — Users, Workspaces & Meta (port 4001)
│   └── agents/           # Per-tenant agent runtime (Kubernetes workload)
│       ├── profiles/     # Agent persona markdown files (IDENTITY, SOUL, PROCESS, …)
│       ├── helm/         # Helm chart — deploys one namespace per customer tenant
│       │   ├── Chart.yaml
│       │   ├── values.yaml
│       │   ├── templates/
│       │   └── files/bootstrap.sh
│       └── tests/        # Agent deployment test scripts
│
├── docs/                 # Product vision, system overview, ADRs
├── Makefile              # Top-level dev commands
└── .env.example          # Root environment variable reference

# Note:
# Cloud provider IaC (Terraform for GCP, Networking, IAM, Billing)
# has been moved to the `sabia-infra` repository. This repository
# focuses exclusively on application logic and Helm manifests.
├── e2e/                  # Cross-system end-to-end tests
└── .github/workflows/    # CI/CD pipelines
```

> **Deployment convention:** each app that runs on Kubernetes will have its Dockerfile and Helm chart under a `deploy/` subfolder (e.g., `apps/web/deploy/`, `apps/kivo-api/deploy/`). ArgoCD will point to those paths per environment.

**Stack:**
- **Frontend:** Next.js 16, Tailwind CSS, shadcn/ui, i18n (EN + ZH)
- **Backend:** Node.js, Express, Drizzle ORM, PostgreSQL, JWT auth (bcryptjs)
- **Agents:** OpenClaw, containerized via Docker/Kubernetes, deployed via Helm
- **Integrations:** Linear (Engineering template)

## Architecture overview

Kivo separates the platform into two distinct planes:

- **Control Plane (`admin-api` + `admin-web`):** Global SaaS layer. Manages users, workspaces, billing, and marketing. Runs in the `kivo-admin` namespace.
- **Application Plane (`kivo-api` + `kivo-web`):** Tenant execution layer. Manages teams, agents, and tasks for specific workspaces. Runs in the `kivo` namespace.

---

## Multi-tenant model

Kivo uses a **Cell-based Architecture** for maximum tenant isolation:

- **Shared SaaS Layer:** Shared deployments of `apps/admin-web` and `apps/admin-api` (Control Plane).
- **Tenant Cells:** Each workspace runs its own agent team in an isolated Kubernetes namespace (`kivo-ws-*`), consuming the Application Plane (`kivo-api` + `kivo-web`).
- **Regional Scaling:** The Application Plane and agents can be deployed in different regions to stay close to the customer data.

---

## Team Templates

| Template | Description |
|---|---|
| **Kivo Starter** | Minimal team — Team Lead only. General-purpose or exploratory use. |
| **Engineering** | Full software delivery squad with SDLC discipline (Engineer, Architect, PM). |
| **Customer Support** | *(Coming soon)* Automated support team. |

Every team requires at least a **Team Lead** — the ownership and coordination primitive.

---

## Running locally

The entire stack (Web, API, PostgreSQL) runs inside local Kubernetes via **Tilt**. One command starts everything.

### Prerequisites

- Docker Desktop with Kubernetes enabled *(Settings → Kubernetes → Enable Kubernetes)*
- [Tilt](https://tilt.dev): `brew install tilt`
- Helm v3+: `brew install helm`

### First-time setup

```bash
# 1. Configure the API environment
cp apps/kivo-api/.env.example apps/kivo-api/.env
# Edit apps/kivo-api/.env and set JWT_SECRET to any local secret
```

### Start the stack

```bash
# Switch context to Docker Desktop if you use multiple clusters
kubectl config use-context docker-desktop

# Start everything — builds images, deploys to local k8s, watches for changes
tilt up
```

The Tilt dashboard opens automatically at **http://localhost:10350**. Wait for all resources to go green.

When done:
```bash
tilt down
```

---

## Testing the onboarding flow

Once the stack is running:

1. **`/signup`** — Create an account (3 steps):
   - Step 1: Full name + work email + password
   - Step 2: Workspace name
   - Step 3: Choose a team template (Kivo Starter or Engineering)
     - **Kivo Starter:** Team name + Team Lead name → creates team → goes to `/teams`
     - **Engineering:** Team name + agent squad (Engineer / Architect / PM) → goes to `/teams`

2. **`/teams`** — Your agent team dashboard after onboarding

3. **`/login`** — Sign back in with the credentials you created

> **Note:** SSO (Google / Microsoft) is UI-only in the current MVP — clicking the buttons shows a "Coming soon" toast. Real OAuth support is a future ticket.

---

## Available make commands

```
make kivo-web      Start client portal (localhost:3000)
make kivo-web-install  Install dependencies

make admin-web      Start marketing/admin portal (localhost:3001)
make admin-install  Install dependencies

make kivo-api      Start Kivo API (localhost:4000)
make kivo-api-install  Install dependencies
make db-migrate     Run Kivo App Drizzle migrations
make db-seed        Seed the app database (requires WORKSPACE_ID)

make admin-api      Start Admin API dev server (localhost:4001)
make admin-install  Install Admin API dependencies
make admin-migrate  Run Admin Drizzle migrations
make admin-seed     Seed the admin database (Users, Workspaces, Types)

make docker-db      Start local PostgreSQL via Docker (kivo & kivo_admin)

make agents-test    Run agent Helm test deployment (requires .env)
make clean          Remove build artifacts
```

---

## Backend API reference

All responses use the envelope: `{ success, data, error }`.

### Control Plane (admin-api:4001)

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/signup` | Create user + workspace, return JWT |
| `POST` | `/auth/login` | Validate credentials, return JWT |
| `GET` | `/meta/team-types` | List available team templates |
| `GET` | `/meta/agent-roles` | List available agent roles |

### Application Plane (kivo-kivo-api:4000)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/auth/me` | Return current actor identity |
| `POST` | `/teams` | Create team + agents |
| `GET` | `/teams` | List teams in workspace |
| `GET` | `/teams/:id` | Get team by ID |
| `PUT` | `/teams/:id` | Update team |
| `DELETE` | `/teams/:id` | Delete team |
| `POST` | `/agents` | Create agent |
| `GET` | `/agents?teamId=` | List agents (optional filter) |
| `GET` | `/agents/:id` | Get agent by ID |
| `PUT` | `/agents/:id` | Update agent |
| `DELETE` | `/agents/:id` | Delete agent |

**Agent types:** `team_lead` · `software_engineer` · `software_architect` · `product_manager` · `project_manager`

**Team templates:** `starter` · `engineering` · `customer_support`

### Environment variables (apps/kivo-api/.env)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://kivo:kivo@localhost:5432/kivo` | PostgreSQL connection string |
| `PORT` | `4000` | HTTP port (loopback-bound) |
| `JWT_SECRET` | — | **Required.** Secret for signing JWTs |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |

---

## 🚀 Local Kubernetes development (Tilt + Docker Desktop)

This is the recommended workflow to develop and test the full stack (Web + API + PostgreSQL) locally inside Kubernetes, mirroring the production environment.

### One-time setup (do once, ever)

```bash
# 1. Enable Kubernetes in Docker Desktop
#    Docker Desktop → Settings → Kubernetes → Enable Kubernetes → Apply

# 2. Install Tilt
brew install tilt

# 3. Confirm Helm is in your PATH (add to ~/.zshrc if needed)
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
helm version --short   # should show v3.x or v4.x
```

### Daily workflow

```bash
# 1. Switch kubectl context to Docker Desktop (only needed if you use multiple clusters)
kubectl config use-context docker-desktop

# 2. Start everything (builds images, deploys to local k8s, opens dashboard)
cd /path/to/kivo
tilt up

# 3. Open the Tilt dashboard (auto-opens, or navigate manually)
open http://localhost:10350

# 4. When done for the day — stop Tilt and remove cluster resources
tilt down
```

> **Context tip:** Docker Desktop persists the `docker-desktop` Kubernetes context permanently. You only need `kubectl config use-context docker-desktop` if you've been working with another cluster (e.g., a cloud cluster) and need to switch back.

### Navigating the database (Drizzle Studio)

Drizzle ships a local web GUI — **Drizzle Studio** — that lets you browse tables, run queries, and inspect data.

#### Local Development (Tilt)

When using Tilt, both databases reside on `localhost:5432`.

```bash
# Browse Application Plane (Teams, Tasks, Agents)
cd apps/kivo-api
pnpm drizzle-kit studio

# Browse Control Plane (Users, Workspaces, OTP Codes)
cd apps/admin-api
DATABASE_URL_ADMIN="postgres://kivo:kivo@localhost:5432/kivo_admin" npx drizzle-kit studio
```

#### Staging Environment

To browse Staging data, first get the credentials and start a port-forward:

```bash
# 1. Start port-forward
kubectl port-forward svc/kivo-db-postgresql 5432:5432 -n kivo-staging

# 2. Browse Staging Control Plane (kivo_admin)
cd apps/admin-api
DATABASE_URL_ADMIN="postgresql://postgres:[PASSWORD]@localhost:5432/kivo_admin" npx drizzle-kit studio
```

> **Architecture Tip:** Always check the `DATABASE_URL` (Application Plane) vs `DATABASE_URL_ADMIN` (Control Plane) to ensure you are looking at the correct domain.

Alternatively, connect directly via `psql`:

```bash
# Interactive psql session inside the running pod
kubectl exec -n kivo statefulset/kivo-postgresql -- psql -U kivo -d kivo
```

### What Tilt does automatically

| Step | What happens |
|---|---|
| Detects file changes | Syncs changed files directly into running pods (live_update) |
| `apps/kivo-api/src/**` changed | TypeScript recompiled inside pod → API restarts in ~3s |
| `apps/web/app/**` changed | Files synced → Next.js HMR picks it up in ~2s |
| `charts/kivo/**` changed | Rerenders Helm templates → applies diff to cluster |
| `apps/kivo-api/Dockerfile` changed | Full image rebuild → redeploy |

### Accessing the services

| Service | URL | Notes |
|---|---|---|
| **Web** | http://kivo.localhost | via Ingress (NGINX) |
| **Web** (direct) | http://localhost:3000 | via Tilt port-forward |
| **API health** | http://localhost:4000/health | Application Plane |
| **Admin API health** | http://localhost:4001/health | Control Plane |
| **PostgreSQL** | `localhost:5432` | user: `kivo` / DBs: `kivo`, `kivo_admin` |
| **Tilt dashboard** | http://localhost:10350 | logs, status, live_update |

### Troubleshooting commands

```bash
# --- Pod status ---
kubectl get pods -A | grep kivo                     # list all kivo pods across namespaces

# --- Logs ---
kubectl logs -n kivo-admin deployment/kivo-admin-api -f  # Admin API logs
kubectl logs -n kivo deployment/kivo-api -f              # Kivo API logs
kubectl logs -n kivo deployment/kivo-web -f              # Web logs
kubectl logs -n kivo statefulset/kivo-postgresql -f      # PostgreSQL logs

# --- Connect to PostgreSQL (for manual queries) ---
kubectl exec -n kivo statefulset/kivo-postgresql -- \
  psql -U kivo -d kivo
kubectl exec -n kivo statefulset/kivo-postgresql -- \
  psql -U kivo -d kivo_admin
```
# --- Force a pod restart without full rebuild ---
kubectl rollout restart -n kivo deployment/kivo-api
kubectl rollout restart -n kivo deployment/kivo-web

# --- Check ingress ---
kubectl get ingress -n kivo
kubectl get pods -n ingress-nginx

# --- Nuclear option: full reset ---
tilt down && tilt up
# Or wipe the namespace entirely (DB data will be lost):
kubectl delete namespace kivo
tilt up
```

### Chart management

```bash
# Lint the Helm chart (all environments)
make k8s-lint

# Render templates as YAML (dry-run — useful for debugging)
make k8s-render

# Lint only
helm lint charts/kivo -f charts/kivo/values-local.yaml
```

### Architecture in local mode

```
Your browser
     │
     ▼
kivo.localhost (port 80)
     │  NGINX Ingress (ingress-nginx namespace)
     ├── /api/* ──▶ kivo-web (proxy to kivo-kivo-api:4000)
     └── /      ──▶ kivo-web:3000
     
  (Development Port-forwards)
  localhost:4000  ──▶ kivo-api (Application Plane, kivo ns)
  localhost:4001  ──▶ kivo-admin-api (Control Plane, kivo-admin ns)
  localhost:5432  ──▶ kivo-postgresql (DB: kivo, kivo_admin)
```

The API has **no Ingress rule** — it is only reachable from within the cluster (from the web pod). This mirrors the production security model.



Agents are deployed as containerized OpenClaw instances via the Helm chart in `apps/agents/helm/`.

```bash
# Quick test deployment (reads credentials from .env)
make agents-test
```

The Helm chart supports:
- Configurable agent profile, model provider, and model name
- Linear MCP integration (enabled via values, Engineering template)
- Telegram bot token for agent communication
- Non-privileged container execution
- One namespace per customer tenant (multi-tenant isolation)

See `apps/agents/helm/values.yaml` for the full configuration reference.

---

## Engineering principles

- **Secrets out of Git.** All credentials via environment variables only.
- **English everywhere.** Code, comments, commits, ADRs — always in English.
- **Approval-aware.** Agents never take external actions without explicit human sign-off.
- **Portable by default.** State persists in Git; any environment can be restored from zero.
- **Strict SDLC.** Every task: ticket intake → DoR check → tech planning → implementation → tests → PR.

---

## Key documents

Under `docs/`:
- `product-vision.md`
- `system-overview.md`
- `agent-persona-software-engineer.md`
- `kubernetes-deployment.md`
- `provider-configuration.md`
- `github-integration.md`
