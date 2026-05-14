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

case $ACTION in
  "bootstrap")
    echo "🔐 Initializing secrets for $ENV..."
    "$SCRIPT_DIR/bootstrap-secrets.sh" "$ENV" "$CTX" "$NS"
    ;;

  "deploy")
    echo "☸️ Deploying Helm chart to $ENV..."
    VALUES_FILE="charts/kivo/values.yaml"
    if [ "$ENV" = "hetzner" ]; then
      VALUES_FILE="charts/kivo/values-hetzner.yaml"
    elif [ "$ENV" = "alibaba" ]; then
      VALUES_FILE="charts/kivo/values-alibaba.yaml"
    fi
    
    h upgrade --install kivo ./charts/kivo \
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
    echo "→ Uninstalling Helm release..."
    h uninstall kivo -n "$NS" --ignore-not-found
    
    # 3. Wipe Workspace Namespaces
    echo "→ Deleting ephemeral workspaces (kivo-ws-*)..."
    k get ns -o name | grep "kivo-ws-" | xargs -r k delete --ignore-not-found
    
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
    k get ns -o name | grep "kivo-ws-" | xargs -r k delete --ignore-not-found
    
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
