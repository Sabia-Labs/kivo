.PHONY: help dev down clean-local staging-reset migrate seed test-agents clean-files ctx-local ctx-staging

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
LOCAL_CTX = docker-desktop
STAGING_CTX = gke_sabia-infra_europe-west3_kivo-staging

# ── HELP ──────────────────────────────────────────────────────────────────────
help: ## Show this help
	@echo "\n  \033[1mKivo Control Interface\033[0m"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ── CONTEXT MANAGEMENT ────────────────────────────────────────────────────────
ctx-local: ## Switch to local context
	kubectl config use-context $(LOCAL_CTX)

ctx-staging: ## Switch to staging context
	kubectl config use-context $(STAGING_CTX)

# ── LOCAL DEVELOPMENT (Tilt/K8s) ──────────────────────────────────────────────
dev: ## Start local environment (Tilt)
	@current_ctx=$$(kubectl config current-context); \
	if [ "$$current_ctx" != "$(LOCAL_CTX)" ]; then \
		echo "\033[31mError: Current context is $$current_ctx. Switch to $(LOCAL_CTX) first!\033[0m"; exit 1; \
	fi
	tilt up

down: ## Stop Tilt
	tilt down

clean-local: ## ⚠ TOTAL WIPE of local K8s (Apps, Namespaces, RabbitMQ, Ingress)
	@current_ctx=$$(kubectl config current-context); \
	if [ "$$current_ctx" != "$(LOCAL_CTX)" ]; then \
		echo "\033[31mFATAL: You are NOT in the local context! Current: $$current_ctx\033[0m"; exit 1; \
	fi
	@echo "→ Deleting all local Kivo related namespaces..."
	kubectl delete namespace kivo kivo-admin infra-messaging ingress-nginx rabbitmq-system --ignore-not-found
	@echo "→ Deleting ephemeral workspace namespaces..."
	kubectl get namespace -o name | grep 'namespace/kivo-ws-' | xargs -r kubectl delete --ignore-not-found
	@echo "✓ Local cluster is clean."

# ── STAGING OPERATIONS (GKE) ──────────────────────────────────────────────────
staging-reset: ## ☢ TOTAL RESET of Staging (Wipes DBs & Reseeds)
	@current_ctx=$$(kubectl config current-context); \
	if [ "$$current_ctx" != "$(STAGING_CTX)" ]; then \
		echo "\033[31mFATAL: You are NOT in the staging context! Current: $$current_ctx\033[0m"; exit 1; \
	fi
	@chmod +x reset_staging.sh
	./reset_staging.sh

staging-status: ## Check status of staging pods
	kubectl get pods -n kivo-staging

# ── DATABASE & TOOLS ──────────────────────────────────────────────────────────
migrate: ## Run Drizzle migrations for both planes (uses LOCAL env vars)
	cd apps/kivo-api && pnpm db:migrate
	cd apps/admin-api && npm run db:migrate

seed: ## Seed Application Plane with Meta Configuration
	cd apps/kivo-api && pnpm db:seed

test-agents: ## Run simple agent deployment test
	bash apps/agents/tests/test-simple.sh

clean-files: ## Remove build artifacts and lock files
	rm -rf apps/kivo-web/.next apps/admin-web/.next apps/kivo-api/dist apps/admin-api/dist
	@echo "✓ Build artifacts removed."
