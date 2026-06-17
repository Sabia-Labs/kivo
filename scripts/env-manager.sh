#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Kivo Environment Manager
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ACTION=$1
ENV=$2
CTX=$3
NS=$4

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔧 Kivo Env Manager | Action: $ACTION | Env: $ENV | Context: $CTX"

# Helper to run kubectl in context
k() {
  kubectl --context "$CTX" "$@"
}

# Helper to run helm in context
h() {
  helm --kube-context "$CTX" "$@"
}

# ── SAFETY LOCK FOR PRODUCTION ────────────────────────────────────────────────
if [ "$ENV" = "production" ]; then
  if [[ "$ACTION" == "deploy" || "$ACTION" == "down" || "$ACTION" == "reset" || "$ACTION" == "bootstrap" ]]; then
    echo "❌ ERROR: Modifying production directly from the terminal is forbidden."
    echo "Produção deve ser gerida exclusivamente pelo fluxo GitOps (ArgoCD)."
    echo "Por favor, abra uma Pull Request com as alterações desejadas."
    exit 1
  fi
fi

case $ACTION in
  "bootstrap")
    echo "🔐 Initializing secrets for $ENV..."
    RELEASE_NAME="kivo"
    if [ "$ENV" = "staging" ]; then
      RELEASE_NAME="kivo-staging"
    fi
    "$SCRIPT_DIR/bootstrap-secrets.sh" "$ENV" "$CTX" "$NS" "$RELEASE_NAME"
    ;;

  "deploy")
    echo "☸️ Deploying Helm chart to $ENV..."
    RELEASE_NAME="kivo"
    VALUES_FILE="charts/kivo/values.yaml"
    if [ "$ENV" = "staging" ]; then
      VALUES_FILE="charts/kivo/values-staging.yaml"
      RELEASE_NAME="kivo-staging"
    fi
    
    h upgrade --install "$RELEASE_NAME" ./charts/kivo \
      --namespace "$NS" \
      --create-namespace \
      -f "$VALUES_FILE"
    ;;

  "down")
    echo "☢ STARTING TOTAL WIPE OF $ENV..."
    
    # 1. Delete Agents (cleanly trigger controller cleanup if possible)
    echo "→ Deleting Agents..."
    k delete agents --all -n "$NS" --ignore-not-found --timeout=30s || true
    
    # 2. Uninstall Helm
    RELEASE_NAME="kivo"
    if [ "$ENV" = "staging" ]; then
      RELEASE_NAME="kivo-staging"
    fi
    echo "→ Uninstalling Helm release $RELEASE_NAME..."
    h uninstall "$RELEASE_NAME" -n "$NS" --ignore-not-found
    
    # 3. Wipe Workspace Namespaces
    echo "→ Deleting ephemeral workspaces (kivo-ws-*)..."
    # shellcheck disable=SC2015
    k get ns -o name | grep "kivo-ws-" > /tmp/ns_to_delete.txt || true
    if [ -s /tmp/ns_to_delete.txt ]; then
      xargs -r kubectl --context "$CTX" delete --ignore-not-found < /tmp/ns_to_delete.txt
    fi
    
    # 4. IMPLODE Primary Namespace
    echo "🔥 Imploding primary namespace: $NS"
    k delete ns "$NS" --ignore-not-found
    

    
    echo "✨ $ENV is now clean."
    ;;

  "reset")
    echo "🔄 STARTING FACTORY RESET OF $ENV..."
    
    # 1. Scale down
    echo "→ Scaling down application pods..."
    k scale deployment -n "$NS" --all --replicas=0
    
    # 2. Reset Database
    echo "→ Wiping and reseeding databases..."
    "$SCRIPT_DIR/reset-db.sh" "$ENV" "$CTX" "$NS"
    
    # 3. Cleanup remaining agent state
    echo "→ Cleaning up Agent CRs and workspaces..."
    k delete agents --all -n "$NS" --ignore-not-found
    k get ns -o name | grep "kivo-ws-" > /tmp/ns_to_delete_reset.txt || true
    if [ -s /tmp/ns_to_delete_reset.txt ]; then
      xargs -r kubectl --context "$CTX" delete --ignore-not-found < /tmp/ns_to_delete_reset.txt
    fi
    
    # 4. Scale up
    echo "→ Scaling up application pods..."
    k scale deployment -n "$NS" --all --replicas=1
    
    echo "✨ Factory Reset complete for $ENV."
    ;;

  *)
    echo "Usage: $0 {bootstrap|deploy|down|reset} {env} {context} {namespace}"
    exit 1
    ;;
esac
