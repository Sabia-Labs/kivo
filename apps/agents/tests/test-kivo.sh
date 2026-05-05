#!/usr/bin/env bash

# test-kivo.sh - Test the Kivo deployment in a fresh k8s namespace

set -e

echo "============================================"
echo " starting Kivo Kubernetes integration test "
echo "============================================"

# 1. Load env vars
echo "[test] Loading .env file..."
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

# Export vars from .env, ignoring comments and empty lines
export $(grep -v '^#' "$REPO_ROOT/.env" | xargs)

echo ""
echo "=================================================================================="
echo "   Agent Identity & Settings             "
echo " "
echo " ENGINEER: ${ENGINEER_AGENT_NAME} / ${ENGINEER_AGENT_PROFILE} / ${ENGINEER_AGENT_OPERATOR_NAME}"
echo " PM : ${PM_AGENT_NAME} / ${PM_AGENT_PROFILE} / ${PM_AGENT_OPERATOR_NAME}"
echo "=================================================================================="
echo ""

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

pod_name=""
pod_name=$(kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME" -o jsonpath='{.items[0].metadata.name}')

if [ -z "$pod_name" ]; then
  echo "[error] Could not find pod for release: $RELEASE_NAME"
  exit 1
fi
echo "[test] Pod found for ${PREFIX}: $pod_name"

echo "[test] Checking OpenClaw binary for ${PREFIX}..."
kubectl exec -n "$NAMESPACE" "$pod_name" -- openclaw --help > /dev/null



echo ""
echo "=================================================================================="
echo " SUBINDO O PM"
echo "=================================================================================="
echo ""

RELEASE_NAME="pm"
PREFIX="product-manager"
kubectl create configmap "product-manager-cm" \
  --namespace "$NAMESPACE" \
  --from-file="$REPO_ROOT/src/agent/profiles/product-manager/"

kubectl create secret generic "pm-model" \
  --namespace "$NAMESPACE" \
  --from-literal=API_KEY="${PM_MODEL_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic "pm-gateway" \
  --namespace "$NAMESPACE" \
  --from-literal=OPENCLAW_GATEWAY_TOKEN="${PM_OPENCLAW_GATEWAY_TOKEN}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic "pm-telegram" \
  --namespace "$NAMESPACE" \
  --from-literal=TELEGRAM_BOT_TOKEN="${PM_TELEGRAM_BOT_TOKEN}" \
  --dry-run=client -o yaml | kubectl apply -f -

if [ "${PM_GITHUB_ENABLED:-false}" = "true" ] && [ -n "${PM_GITHUB_PAT:-}" ]; then
  kubectl create secret generic "pm-github" \
    --namespace "$NAMESPACE" \
    --from-literal=GITHUB_PERSONAL_ACCESS_TOKEN="${PM_GITHUB_PAT}" \
    --dry-run=client -o yaml | kubectl apply -f -
fi


echo "[test] Installing Helm chart for product manager..."

helm install "$RELEASE_NAME" "$REPO_ROOT/src/k8s/helm/kivo" \
  --namespace "$NAMESPACE" \
  --set image.pullPolicy=IfNotPresent \
  --set profile.agentName="${PM_AGENT_NAME}" \
  --set profile.type="${PM_AGENT_PROFILE}" \
  --set profile.operatorName="${PM_AGENT_OPERATOR_NAME}" \
  --set profile.configMapName="product-manager-cm" \
  --set model.provider="${PM_MODEL_PROVIDER}" \
  --set model.name="${PM_MODEL_NAME}" \
  --set model.secretName="pm-model" \
  --set model.key="API_KEY" \
  --set telegram.enabled=true \
  --set telegram.secretName="pm-telegram" \
  --set telegram.tokenKey="TELEGRAM_BOT_TOKEN" \
  --set runtime.gateway.secretName="pm-gateway" \
  --set runtime.gateway.tokenKey="OPENCLAW_GATEWAY_TOKEN" \
  --set persistence.enabled=true \
  --set linear.enabled="${PM_LINEAR_ENABLED:-false}" \
  --set linear.credentials.key="${PM_LINEAR_API_KEY:-}" \
  --set github.enabled="${PM_GITHUB_ENABLED:-false}" \
  --set github.authMode="${PM_GITHUB_AUTH_MODE:-pat}" \
  --set github.secretName="pm-github" \
  --set github.credentials.tokenKey="GITHUB_PERSONAL_ACCESS_TOKEN" \
  --wait \
  --timeout 3m

pod_name=""
pod_name=$(kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME" -o jsonpath='{.items[0].metadata.name}')

if [ -z "$pod_name" ]; then
  echo "[error] Could not find pod for release: $RELEASE_NAME"
  exit 1
fi
echo "[test] Pod found for ${PREFIX}: $pod_name"

echo "[test] Checking OpenClaw binary for ${PREFIX}..."
kubectl exec -n "$NAMESPACE" "$pod_name" -- openclaw --help > /dev/null

echo "[test] All checks passed successfully!"

echo ""
echo "======================================================================="
echo " Tests completed. The namespace $NAMESPACE is active."
echo " You can explore the pods using: kubectl -n $NAMESPACE get pods"
echo " Press any key to tear down the namespace and exit..."
echo "======================================================================="
read -n 1 -s -r
