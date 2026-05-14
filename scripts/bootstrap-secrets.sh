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

# 2. API Staging Secret (JWT, Tokens, etc.)
if ! k get secret kivo-api-staging-secret -n "$NS" >/dev/null 2>&1; then
  echo "   -> Initializing API secrets..."
  JWT_SECRET=$(openssl rand -base64 32)
  INTERNAL_TOKEN=$(openssl rand -base64 32)
  
  # Try to pull from local .env if available
  OAI_KEY=$(grep "^OPENAI_API_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "placeholder")
  
  k create secret generic kivo-api-staging-secret -n "$NS" \
    --from-literal=JWT_SECRET="$JWT_SECRET" \
    --from-literal=INTERNAL_SERVICE_TOKEN="$INTERNAL_TOKEN" \
    --from-literal=PLATFORM_OPENAI_API_KEY="$OAI_KEY" \
    --from-literal=GOOGLE_CLIENT_ID="placeholder" \
    --from-literal=GOOGLE_CLIENT_SECRET="placeholder" \
    --from-literal=PLATFORM_GEMINI_API_KEY="placeholder" \
    --from-literal=RESEND_API_KEY="placeholder"
fi

echo "✅ Secrets initialized for $ENV."
