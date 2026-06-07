#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Kivo Secrets Bootstrap (Generalized)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV=$1
CTX=$2
NS=$3
RELEASE_NAME=${4:-kivo}

echo "🔐 Bootstrapping secrets for $ENV in namespace $NS (Release: $RELEASE_NAME)..."

# Helper to run kubectl in context
k() {
  kubectl --context "$CTX" "$@"
}

# Ensure namespace exists and has Helm ownership metadata
k create namespace "$NS" --dry-run=client -o yaml | k apply -f -
k label namespace "$NS" app.kubernetes.io/managed-by=Helm --overwrite
k annotate namespace "$NS" meta.helm.sh/release-name="$RELEASE_NAME" --overwrite
k annotate namespace "$NS" meta.helm.sh/release-namespace="$NS" --overwrite

# 1. Database Credentials (if not exist)
if ! k get secret kivo-db-credentials -n "$NS" >/dev/null 2>&1; then
  echo "   -> Creating default DB credentials..."
  DB_PWD="kivo_local_only"
  DB_URL="postgres://kivo:$DB_PWD@kivo-postgresql:5432/kivo"
  k create secret generic kivo-db-credentials -n "$NS" --from-literal=DATABASE_URL="$DB_URL"
fi

# 2. GitHub Container Registry Secret (Image Pull)
if ! k get secret ghcr-pull-secret -n "$NS" >/dev/null 2>&1; then
  # Try to pull from local .env if available
  GH_USER=$(grep "^GITHUB_USERNAME=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
  GH_TOKEN=$(grep "^GITHUB_TOKEN=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
  
  if [ -n "$GH_USER" ] && [ -n "$GH_TOKEN" ]; then
    echo "   -> Creating ghcr-pull-secret..."
    k create secret docker-registry ghcr-pull-secret \
      --docker-server=ghcr.io \
      --docker-username="$GH_USER" \
      --docker-password="$GH_TOKEN" \
      --docker-email="ops@sabia.cc" \
      -n "$NS"
  else
    echo "   ⚠️  GITHUB_USERNAME/TOKEN not found in .env. Skipping ghcr-pull-secret."
  fi
fi

  echo "   -> Updating API secrets..."
  # Try to pull from local .env if available (check root and app dirs)
  OAI_KEY=$(grep "^OPENAI_API_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || grep "^OPENAI_API_KEY=" apps/kivo-api/.env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "placeholder")
  GEMINI_KEY=$(grep "^GEMINI_API_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "placeholder")
  RESEND_KEY=$(grep "^RESEND_API_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "placeholder")
  G_CLIENT_ID=$(grep "^GOOGLE_CLIENT_ID=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "placeholder")
  G_CLIENT_SECRET=$(grep "^GOOGLE_CLIENT_SECRET=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "placeholder")

  # Generate or reuse sensitive tokens
  JWT_SECRET=$(k get secret kivo-api-secret -n "$NS" -o jsonpath='{.data.JWT_SECRET}' 2>/dev/null | base64 -d || openssl rand -base64 32)
  INTERNAL_TOKEN=$(k get secret kivo-api-secret -n "$NS" -o jsonpath='{.data.INTERNAL_SERVICE_TOKEN}' 2>/dev/null | base64 -d || openssl rand -base64 32)

  cat <<EOF | k apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: kivo-api-secret
  namespace: $NS
type: Opaque
stringData:
  JWT_SECRET: "$JWT_SECRET"
  INTERNAL_SERVICE_TOKEN: "$INTERNAL_TOKEN"
  OPENAI_API_KEY: "$OAI_KEY"
  GOOGLE_CLIENT_ID: "$G_CLIENT_ID"
  GOOGLE_CLIENT_SECRET: "$G_CLIENT_SECRET"
  GEMINI_API_KEY: "$GEMINI_KEY"
  RESEND_API_KEY: "$RESEND_KEY"
EOF

echo "✅ Secrets initialized for $ENV."
