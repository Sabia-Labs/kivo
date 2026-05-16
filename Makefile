.PHONY: help up down reset status ctx-local ctx-staging ctx-hetzner ctx-alibaba

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
ENV ?= local
NAMESPACE = kivo-staging
CTX = docker-desktop

ifeq ($(ENV),local)
	NAMESPACE = kivo
else ifeq ($(ENV),staging)
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

secrets: ## 🔐 Initialize/Update secrets for current ENV
	@chmod +x scripts/*.sh
	@scripts/env-manager.sh bootstrap $(ENV) $(CTX) $(NAMESPACE)

drizzle-kivo: ## 🗄️ Open Drizzle Studio for Kivo DB (ENV=local|staging|hetzner)
	@chmod +x scripts/*.sh
	@scripts/drizzle-manager.sh kivo $(ENV) $(CTX) $(NAMESPACE)

drizzle-admin: ## 🗄️ Open Drizzle Studio for Admin DB (ENV=local|staging|hetzner)
	@chmod +x scripts/*.sh
	@scripts/drizzle-manager.sh admin $(ENV) $(CTX) $(NAMESPACE)

# ── UTILS ─────────────────────────────────────────────────────────────────────

gcloud-auth: ## 🔐 Authenticate with Google Cloud
	@gcloud auth login
	@gcloud auth application-default login

hetzner-install-cert-manager: ## 🛡️ Install cert-manager on Hetzner
	@echo "🛡️ Installing cert-manager on $(CTX)..."
	@KUBECONFIG=$(KUBECONFIG) helm --kube-context $(CTX) repo add jetstack https://charts.jetstack.io || true
	@KUBECONFIG=$(KUBECONFIG) helm --kube-context $(CTX) repo update
	@KUBECONFIG=$(KUBECONFIG) helm --kube-context $(CTX) upgrade --install cert-manager jetstack/cert-manager \
		--namespace cert-manager \
		--create-namespace \
		--set installCRDs=true \
		--wait
	@echo "✅ cert-manager installed."

argo: ## 🌐 Open ArgoCD UI (Port-forward + Credentials)
	@echo "🔐 Initial Admin Password:"
	@kubectl --context $(CTX) -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d && echo ""
	@echo "🚀 Opening ArgoCD at http://localhost:8080 (User: admin)"
	@kubectl --context $(CTX) port-forward svc/argocd-server -n argocd 8080:443

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
