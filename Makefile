.PHONY: help forge-web admin-web forge-web-install web-kill web-build forge-api forge-api-install db-migrate db-seed docker-db agents-test \
        tilt-up tilt-down k8s-lint k8s-render k8s-namespace clean-k8s clean

# Default target
help:
	@echo ""
	@echo "  Forge — Dev Commands"
	@echo ""
	@echo "  Forge Web (apps/forge-web) - Client Portal"
	@echo "  ─────────────────────────────────────"
	@echo "  make forge-web      Start client portal (localhost:3000)"
	@echo "  make forge-web-install  Install dependencies"
	@echo ""
	@echo "  Admin Web (apps/admin-web) - Marketing/Admin Portal"
	@echo "  ─────────────────────────────────────"
	@echo "  make admin-web      Start admin portal (localhost:3001)"
	@echo "  make admin-install  Install dependencies"
	@echo ""
	@echo "  Forge API (apps/forge-api)"
	@echo "  ─────────────────────────────────────"
	@echo "  make forge-api      Start App API (localhost:4000)"
	@echo "  make forge-api-install  Install dependencies"
	@echo "  make db-migrate     Run Drizzle migrations"
	@echo "  make db-seed        Seed with demo data (requires WORKSPACE_ID)"
	@echo ""
	@echo "  Admin API (apps/admin-api)"
	@echo "  ─────────────────────────────────────"
	@echo "  make admin-api      Start Admin API dev server (localhost:4001)"
	@echo "  make admin-install  Install Admin API dependencies"
	@echo "  make admin-migrate  Run Admin Drizzle migrations"
	@echo ""
	@echo "  Infrastructure"
	@echo "  ─────────────────────────────────────"
	@echo "  make docker-db      Start local PostgreSQL via Docker (forge & forge_admin)"
	@echo ""
	@echo "  Agents (apps/agents)"
	@echo "  ─────────────────────────────────────"
	@echo "  make agents-test    Run agent Helm test deployment"
	@echo ""
	@echo "  Kubernetes / Tilt (FOR-53)"
	@echo "  ─────────────────────────────────────"
	@echo "  make tilt-up        Start local k8s dev environment (Tilt)"
	@echo "  make tilt-down      Stop Tilt and clean up local k8s resources"
	@echo "  make k8s-lint       Lint the Helm chart (all environments)"
	@echo "  make k8s-render     Render Helm templates for local (dry-run)"
	@echo "  make k8s-namespace  Create the forge namespace (one-time setup)"
	@echo "  make clean-k8s     ⚠ Delete forge + all forge-ws-* namespaces (dev reset)"
	@echo ""
	@echo "  Utilities"
	@echo "  ─────────────────────────────────────"
	@echo "  make clean          Remove build artifacts and lock files"
	@echo ""

# ── Web ────────────────────────────────────────────────────────────────────────

forge-web: web-kill
	cd apps/forge-web && npm run dev

forge-web-install:
	cd apps/forge-web && npm install

admin-web: web-kill
	cd apps/admin-web && npm run dev

admin-install:
	cd apps/admin-web && npm install

web-build:
	cd apps/forge-web && npm run build
	cd apps/admin-web && npm run build

web-kill:
	@pkill -f "next dev" 2>/dev/null || true
	@rm -rf apps/forge-web/.next/dev/lock apps/admin-web/.next/dev/lock 2>/dev/null || true
	@echo "✓ Web dev servers stopped"

# ── API ────────────────────────────────────────────────────────────────────────

forge-api:
	cd apps/forge-api && pnpm dev

forge-api-install:
	cd apps/forge-api && pnpm install

db-generate:
	cd apps/forge-api && pnpm db:generate

db-migrate:
	cd apps/forge-api && pnpm db:migrate

db-seed:
	cd apps/forge-api && pnpm db:seed $(WORKSPACE_ID)

# ── Admin API ──────────────────────────────────────────────────────────────────

admin-api:
	cd apps/admin-api && npm run dev

admin-install:
	cd apps/admin-api && npm install

admin-migrate:
	cd apps/admin-api && npm run db:migrate

admin-seed:
	cd apps/admin-api && npm run db:seed

docker-db:
	@docker run --rm --name forge-postgres \
		-e POSTGRES_USER=forge \
		-e POSTGRES_PASSWORD=forge \
		-e POSTGRES_DB=forge \
		-p 5432:5432 \
		-d postgres:16-alpine
	@echo "Waiting for postgres to start..."
	@sleep 5
	@docker exec -it forge-postgres psql -U forge -d postgres -c "CREATE DATABASE forge_admin;" || true
	@docker attach forge-postgres

# ── Agents ────────────────────────────────────────────────────────────────────

agents-test:
	bash apps/agents/tests/test-simple.sh

# ── Kubernetes / Tilt ─────────────────────────────────────────────────────────

## Start the full local k8s environment via Tilt (docker-desktop context required)
tilt-up:
	tilt up

## Stop Tilt and remove all deployed resources from the local cluster
tilt-down:
	tilt down
	@echo "→ Removing old agent PVCs from workspace namespaces to ensure fresh state on next boot..."
	@kubectl get namespace -o name | grep 'namespace/forge-ws-' | sed 's/namespace\///' | xargs -r -I {} kubectl delete pvc --all -n {} --ignore-not-found

## Lint the Helm chart against all environment values files
k8s-lint:
	@echo "→ Linting chart with values-local.yaml..."
	helm lint charts/forge -f charts/forge/values-local.yaml
	@echo "→ Linting chart with values-uat.yaml..."
	helm lint charts/forge -f charts/forge/values-uat.yaml --set api.image.tag=lint --set web.image.tag=lint
	@echo "→ Linting chart with values-prod.yaml..."
	helm lint charts/forge -f charts/forge/values-prod.yaml --set api.image.tag=lint --set web.image.tag=lint
	@echo "✓ All Helm lints passed"

## Render and print Helm templates for local (useful for debugging)
k8s-render:
	helm template forge charts/forge -f charts/forge/values-local.yaml

## Create the forge namespace (idempotent — safe to run multiple times)
k8s-namespace:
	kubectl create namespace forge --dry-run=client -o yaml | kubectl apply -f -

## Delete the forge namespace AND all forge-ws-* workspace namespaces.
## ⚠  DESTRUCTIVE: wipes all agent PVCs, Secrets, and state for every workspace.
## Use only during local dev to start fresh. Never run against production.
clean-k8s:
	@echo ""
	@echo "  ⚠  WARNING: This will permanently delete:"
	@echo "     • namespace/forge  (API, Web, Controller, PostgreSQL, all data)"
	@echo "     • all forge-ws-* namespaces (agent pods, PVCs, Secrets)"
	@echo ""
	@printf "  Type 'yes' to confirm: "; read CONFIRM; \
	if [ "$$CONFIRM" = "yes" ]; then \
		echo "→ Deleting namespace forge and forge-admin..."; \
		kubectl delete namespace forge --ignore-not-found; \
		kubectl delete namespace forge-admin --ignore-not-found; \
		echo "→ Deleting forge-ws-* namespaces..."; \
		kubectl get namespace -o name | grep 'namespace/forge-ws-' | xargs -r kubectl delete --ignore-not-found; \
		echo "✓ Done. Run 'make tilt-up' to start fresh."; \
	else \
		echo "Aborted."; \
	fi

# ── Utilities ─────────────────────────────────────────────────────────────────

clean: web-kill
	rm -rf apps/forge-web/.next apps/admin-web/.next apps/forge-api/dist apps/admin-api/dist
	@echo "✓ Clean done"

