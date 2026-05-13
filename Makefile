.PHONY: help dev down clean-local clean-staging staging-reset migrate seed clean-files ctx-local ctx-staging local-db-studio local-admin-db-studio staging-db-studio staging-admin-db-studio argo-ui gcloud-auth

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
LOCAL_CTX = docker-desktop
STAGING_CTX = gke_sabia-infra_europe-west3_kivo-staging
STAGING_NAMESPACE = kivo-staging

# ── HELP ──────────────────────────────────────────────────────────────────────
help: ## Show this help
	@echo "\n  \033[1mKivo Control Interface\033[0m"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-24s\033[0m %s\n", $$1, $$2}'

# ── CONTEXT & AUTH ────────────────────────────────────────────────────────────
ctx-local: ## Switch to local context
	kubectl config use-context $(LOCAL_CTX)

ctx-staging: ## Switch to staging context
	kubectl config use-context $(STAGING_CTX)

gcloud-auth: ## Ensure gcloud is authenticated
	@echo "Checking gcloud authentication..."
	@gcloud auth print-access-token >/dev/null 2>&1 || (echo "⚠️ Not authenticated. Running gcloud auth login..." && gcloud auth login)

# ── LOCAL DEVELOPMENT (Tilt/K8s) ──────────────────────────────────────────────
dev: ## Start local environment (Tilt)
	@current_ctx=$$(kubectl config current-context); \
	if [ "$$current_ctx" != "$(LOCAL_CTX)" ]; then \
		echo "\033[31mError: Current context is $$current_ctx. Switch to $(LOCAL_CTX) first!\033[0m"; exit 1; \
	fi
	tilt up

down: ## Stop Tilt
	tilt down

clean-local: ## ⚠ TOTAL WIPE of local K8s (Apps, Namespaces, Ingress)
	@current_ctx=$$(kubectl config current-context); \
	if [ "$$current_ctx" != "$(LOCAL_CTX)" ]; then \
		echo "\033[31mFATAL: You are NOT in the local context! Current: $$current_ctx\033[0m"; exit 1; \
	fi
	@echo "→ Deleting all local Kivo related namespaces..."
	kubectl delete namespace kivo kivo-admin ingress-nginx --ignore-not-found
	@echo "→ Deleting ephemeral workspace namespaces..."
	kubectl get namespace -o name | grep 'namespace/kivo-ws-' | xargs -r kubectl delete --ignore-not-found
	@echo "✓ Local cluster is clean."
	
clean-staging: gcloud-auth ## ⚠ TOTAL WIPE of Staging resources (Apps & Workspaces)
	@current_ctx=$$(kubectl config current-context); \
	if [ "$$current_ctx" != "$(STAGING_CTX)" ]; then \
		echo "\033[31mFATAL: You are NOT in the staging context! Current: $$current_ctx\033[0m"; exit 1; \
	fi
	@echo "→ Deleting all resources in $(STAGING_NAMESPACE)..."
	kubectl delete all,pvc,secrets,configmaps --all -n $(STAGING_NAMESPACE) --ignore-not-found
	@echo "→ Deleting ephemeral workspace namespaces..."
	kubectl get namespace -o name | grep 'namespace/kivo-ws-' | xargs -r kubectl delete --ignore-not-found
	@echo "✓ Staging environment is clean."

# ── STAGING OPERATIONS (GKE/Argo) ─────────────────────────────────────────────
staging-bootstrap: gcloud-auth ## 🚀 Initialize mandatory secrets for Staging
	@current_ctx=$$(kubectl config current-context); \
	if [ "$$current_ctx" != "$(STAGING_CTX)" ]; then \
		echo "\033[31mFATAL: You are NOT in the staging context! Current: $$current_ctx\033[0m"; exit 1; \
	fi
	@chmod +x setup_staging_secrets.sh
	./setup_staging_secrets.sh

staging-reset: gcloud-auth ## ☢ TOTAL RESET of Staging (Wipes DBs & Reseeds)
	@current_ctx=$$(kubectl config current-context); \
	if [ "$$current_ctx" != "$(STAGING_CTX)" ]; then \
		echo "\033[31mFATAL: You are NOT in the staging context! Current: $$current_ctx\033[0m"; exit 1; \
	fi
	@# Check if secrets exist before running reset
	@kubectl get secret kivo-db-credentials -n $(STAGING_NAMESPACE) >/dev/null 2>&1 || (echo "❌ Error: kivo-db-credentials not found. Run 'make staging-bootstrap' first!" && exit 1)
	@chmod +x reset_staging.sh
	./reset_staging.sh

staging-status: gcloud-auth ## Check status of staging pods
	kubectl get pods -n $(STAGING_NAMESPACE)

argo-ui: gcloud-auth ## Open ArgoCD UI (Port-forward + Credentials)
	@echo "🔐 Initial Admin Password:"
	@kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d && echo ""
	@echo "🚀 Opening ArgoCD at http://localhost:8080 (User: admin)"
	@kubectl port-forward svc/argocd-server -n argocd 8080:443

# ── DATABASE & STUDIO (LOCAL) ─────────────────────────────────────────────────
local-db-studio: ## Open Drizzle Studio for Application Plane (Local)
	(cd apps/kivo-api && pnpm drizzle-kit studio)

local-admin-db-studio: ## Open Drizzle Studio for Control Plane (Local)
	(cd apps/admin-api && DATABASE_URL_ADMIN="postgres://kivo:kivo@localhost:5432/kivo_admin" npx drizzle-kit studio)

# ── DATABASE & STUDIO (STAGING) ───────────────────────────────────────────────
staging-db-studio: gcloud-auth ## Open Drizzle Studio for Staging App Plane (Local Port-forward)
	@echo "🔌 Starting port-forward to staging DB..."
	@kubectl port-forward svc/kivo-db-postgresql 5433:5432 -n $(STAGING_NAMESPACE) > /dev/null 2>&1 & \
	PF_PID=$$!; \
	echo "🚀 Starting Studio (Ctrl+C to stop)..."; \
	trap "kill $$PF_PID" EXIT; \
	DB_PWD=$$(kubectl get secret kivo-db-credentials -n $(STAGING_NAMESPACE) -o jsonpath='{.data.DATABASE_URL}' | base64 -d | grep -o ':[^:]*@' | sed 's/://g' | sed 's/@//g'); \
	(cd apps/kivo-api && DATABASE_URL="postgresql://postgres:$$DB_PWD@localhost:5433/kivo" pnpm drizzle-kit studio)

staging-admin-db-studio: gcloud-auth ## Open Drizzle Studio for Staging Control Plane (Local Port-forward)
	@echo "🔌 Starting port-forward to staging DB..."
	@kubectl port-forward svc/kivo-db-postgresql 5433:5432 -n $(STAGING_NAMESPACE) > /dev/null 2>&1 & \
	PF_PID=$$!; \
	echo "🚀 Starting Studio (Ctrl+C to stop)..."; \
	trap "kill $$PF_PID" EXIT; \
	DB_PWD=$$(kubectl get secret kivo-db-credentials -n $(STAGING_NAMESPACE) -o jsonpath='{.data.DATABASE_URL}' | base64 -d | grep -o ':[^:]*@' | sed 's/://g' | sed 's/@//g'); \
	(cd apps/admin-api && DATABASE_URL_ADMIN="postgresql://postgres:$$DB_PWD@localhost:5433/kivo_admin" npx drizzle-kit studio)

migrate: ## Run Drizzle migrations for both planes (Local)
	(cd apps/kivo-api && pnpm db:migrate)
	(cd apps/admin-api && npm run db:migrate)

seed: ## Seed Application Plane with Meta Configuration (Local)
	(cd apps/kivo-api && pnpm db:seed)

# ── UTILS ─────────────────────────────────────────────────────────────────────

clean-files: ## Remove build artifacts and lock files
	rm -rf apps/kivo-web/.next apps/admin-web/.next apps/kivo-api/dist apps/admin-api/dist
	@echo "✓ Build artifacts removed."
