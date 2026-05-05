#!/usr/bin/env bash

set -e

echo "============================================"
echo " starting Kivo Kubernetes integration test "
echo "============================================"

echo "[test] Loading .env file..."
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
export $(grep -v '^#' "$REPO_ROOT/.env" | xargs)

NAMESPACE="kivo-test"
echo "[test] Creating namespace: $NAMESPACE"
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | \
  kubectl apply -f -

function cleanup {
  echo "========================================="
  echo "[test] Cleaning up namespace: $NAMESPACE"
  kubectl delete namespace "$NAMESPACE" --ignore-not-found
  echo "========================================="
}

# Ensure cleanup runs on exit (both success and failure)
trap cleanup EXIT


echo ""
echo "=================================================================================="
echo " SUBINDO O ENGENHEIRO"
echo "=================================================================================="
echo ""

RELEASE_NAME="engineer"
PREFIX="software-engineer"
kubectl create configmap "software-engineer-cm" \
  --namespace "$NAMESPACE" \
  --from-file="$REPO_ROOT/src/agent/profiles/software-engineer/"

kubectl create secret generic "engineer-model" \
  --namespace "$NAMESPACE" \
  --from-literal=API_KEY="${ENGINEER_MODEL_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic "engineer-gateway" \
  --namespace "$NAMESPACE" \
  --from-literal=OPENCLAW_GATEWAY_TOKEN="${ENGINEER_OPENCLAW_GATEWAY_TOKEN}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic "engineer-telegram" \
  --namespace "$NAMESPACE" \
  --from-literal=TELEGRAM_BOT_TOKEN="${ENGINEER_TELEGRAM_BOT_TOKEN}" \
  --dry-run=client -o yaml | kubectl apply -f -

if [ "${ENGINEER_GITHUB_ENABLED:-false}" = "true" ] && [ -n "${ENGINEER_GITHUB_PAT:-}" ]; then
  kubectl create secret generic "engineer-github" \
    --namespace "$NAMESPACE" \
    --from-literal=GITHUB_PERSONAL_ACCESS_TOKEN="${ENGINEER_GITHUB_PAT}" \
    --dry-run=client -o yaml | kubectl apply -f -
fi

echo "[test] Installing Helm chart for software engineer..."

helm install "$RELEASE_NAME" "$REPO_ROOT/src/k8s/helm/kivo" \
  --namespace "$NAMESPACE" \
  --set image.pullPolicy=IfNotPresent \
  --set profile.agentName="${ENGINEER_AGENT_NAME}" \
  --set profile.type="${ENGINEER_AGENT_PROFILE}" \
  --set profile.operatorName="${ENGINEER_AGENT_OPERATOR_NAME}" \
  --set profile.configMapName="software-engineer-cm" \
  --set model.provider="${ENGINEER_MODEL_PROVIDER}" \
  --set model.name="${ENGINEER_MODEL_NAME}" \
  --set model.secretName="engineer-model" \
  --set model.key="API_KEY" \
  --set telegram.enabled=true \
  --set telegram.secretName="engineer-telegram" \
  --set telegram.tokenKey="TELEGRAM_BOT_TOKEN" \
  --set runtime.gateway.secretName="engineer-gateway" \
  --set runtime.gateway.tokenKey="OPENCLAW_GATEWAY_TOKEN" \
  --set persistence.enabled=true \
  --set linear.enabled="${ENGINEER_LINEAR_ENABLED:-false}" \
  --set linear.credentials.key="${ENGINEER_LINEAR_API_KEY:-}" \
  --set github.enabled="${ENGINEER_GITHUB_ENABLED:-false}" \
  --set github.authMode="${ENGINEER_GITHUB_AUTH_MODE:-pat}" \
  --set github.secretName="engineer-github" \
  --set github.credentials.tokenKey="GITHUB_PERSONAL_ACCESS_TOKEN" \
  --wait \
  --timeout 3m

echo ""
echo "======================================================================="
echo " Namespace $NAMESPACE is active."
echo " Press any key to tear down the namespace and exit..."
echo "======================================================================="
read -n 1 -s -r
