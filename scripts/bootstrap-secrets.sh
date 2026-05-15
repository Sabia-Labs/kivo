#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Kivo Secrets Bootstrap (Generalized)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV=$1
CTX=$2
NS=$3

echo "🔐 Bootstrapping secrets for $ENV in namespace $NS..."

# Helper to run kubectl in context
k() {
  kubectl --context "$CTX" "$@"
}

# Ensure namespace exists and has Helm ownership metadata
k create namespace "$NS" --dry-run=client -o yaml | k apply -f -
k label namespace "$NS" app.kubernetes.io/managed-by=Helm --overwrite
k annotate namespace "$NS" meta.helm.sh/release-name=kivo --overwrite
k annotate namespace "$NS" meta.helm.sh/release-namespace="$NS" --overwrite

# 1. Database Credentials (if not exist)
if ! k get secret kivo-db-credentials -n "$NS" >/dev/null 2>&1; then
  echo "   -> Creating default DB credentials..."
  DB_PWD="kivo_local_only"
  DB_URL="postgres://kivo:$DB_PWD@kivo-postgresql:5432/kivo"
  DB_URL_ADMIN="postgres://kivo:$DB_PWD@kivo-postgresql:5432/kivo_admin"
  
  k create secret generic kivo-db-credentials -n "$NS" --from-literal=DATABASE_URL="$DB_URL"
  k create secret generic kivo-admin-db-credentials -n "$NS" --from-literal=DATABASE_URL_ADMIN="$DB_URL_ADMIN"
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

# 3. API Staging Secret (JWT, Tokens, etc.)
if ! k get secret kivo-api-staging-secret -n "$NS" >/dev/null 2>&1; then
  echo "   -> Initializing API secrets..."
  JWT_SECRET=$(openssl rand -base64 32)
  INTERNAL_TOKEN=$(openssl rand -base64 32)
  
  # Try to pull from local .env if available
  OAI_KEY=$(grep "^OPENAI_API_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "placeholder")
  GEMINI_KEY=$(grep "^GEMINI_API_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "placeholder")
  RESEND_KEY=$(grep "^RESEND_API_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "placeholder")
  G_CLIENT_ID=$(grep "^GOOGLE_CLIENT_ID=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "placeholder")
  G_CLIENT_SECRET=$(grep "^GOOGLE_CLIENT_SECRET=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "placeholder")

  k create secret generic kivo-api-staging-secret -n "$NS" \
    --from-literal=JWT_SECRET="$JWT_SECRET" \
    --from-literal=INTERNAL_SERVICE_TOKEN="$INTERNAL_TOKEN" \
    --from-literal=PLATFORM_OPENAI_API_KEY="$OAI_KEY" \
    --from-literal=GOOGLE_CLIENT_ID="$G_CLIENT_ID" \
    --from-literal=GOOGLE_CLIENT_SECRET="$G_CLIENT_SECRET" \
    --from-literal=PLATFORM_GEMINI_API_KEY="$GEMINI_KEY" \
    --from-literal=RESEND_API_KEY="$RESEND_KEY"
fi

echo "✅ Secrets initialized for $ENV."
