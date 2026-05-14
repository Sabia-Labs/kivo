.PHONY: help up down reset status ctx-local ctx-staging ctx-hetzner ctx-alibaba

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
ENV ?= local
NAMESPACE = kivo-staging
CTX = docker-desktop

ifeq ($(ENV),staging)
	CTX = gke_sabia-infra_europe-west3_kivo-staging
	NAMESPACE = kivo-staging
else ifeq ($(ENV),hetzner)
	CTX = hetzner-vps
	NAMESPACE = kivo-staging
	KUBECONFIG = ../sabia-infra/infra/products/kivo/hetzner-vps/kubeconfig.yaml
	export KUBECONFIG
else ifeq ($(ENV),alibaba)
	CTX = default
	NAMESPACE = kivo-staging
	KUBECONFIG = ../sabia-infra/infra/products/kivo/alibaba-vps/kubeconfig.yaml
	export KUBECONFIG
endif

# ── CORE TARGETS ──────────────────────────────────────────────────────────────

up: ## 🚀 Deploy environment (Bootstrap + Helm)
	@chmod +x scripts/*.sh
	@scripts/env-manager.sh bootstrap $(ENV) $(CTX) $(NAMESPACE)
	@scripts/env-manager.sh deploy $(ENV) $(CTX) $(NAMESPACE)

down: ## ☢ TOTAL WIPE (Delete Release + Namespace + Workspaces)
	@chmod +x scripts/*.sh
	@scripts/env-manager.sh down $(ENV) $(CTX) $(NAMESPACE)

reset: ## 🔄 Factory Reset (Scale down + Wipe DB + Seed + Cleanup Agents)
	@chmod +x scripts/*.sh
	@scripts/env-manager.sh reset $(ENV) $(CTX) $(NAMESPACE)

# ── UTILS ─────────────────────────────────────────────────────────────────────

argo: ## 🌐 Open ArgoCD UI
	@open https://argo.sabia.cc/applications/kivo-staging

status: ## 📊 Show cluster health
	@echo "🏥 Cluster: $(CTX) | Namespace: $(NAMESPACE)"
	@kubectl --context $(CTX) get pods -n $(NAMESPACE)
	@kubectl --context $(CTX) get agents -n $(NAMESPACE)
	@echo "🌐 Workspace Namespaces:"
	@kubectl --context $(CTX) get ns | grep kivo-ws- || echo "None"

# ── CONTEXT HELPERS ───────────────────────────────────────────────────────────
ctx-local:
	kubectl config use-context docker-desktop
ctx-staging:
	kubectl config use-context gke_sabia-infra_europe-west3_kivo-staging
ctx-hetzner:
	kubectl config use-context hetzner-vps
ctx-alibaba:
	kubectl config use-context alibaba-vps

# ── HELP ──────────────────────────────────────────────────────────────────────
help: ## Show this help
	@echo "\n  \033[1mKivo Environment Manager\033[0m"
	@echo "  \033[1mUsage:\033[0m make ENV=<env> <target>"
	@echo "  \033[1mEnvironments:\033[0m local (default), staging (GCP), hetzner, alibaba\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-24s\033[0m %s\n", $$1, $$2}'
