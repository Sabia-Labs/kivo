#!/bin/bash
# 🚀 Kivo Staging Bootstrap: Secret Initialization
# This script creates the minimum required secrets for ArgoCD to deploy the staging environment.
# Use this after cleaning up or deleting the kivo-staging namespace.

set -e

NAMESPACE="kivo-staging"
DEFAULT_DB_PWD="kivo_local_only"

echo "🎯 Target Namespace: $NAMESPACE"

# 1. Database Password
read -p "Enter Postgres Password [$DEFAULT_DB_PWD]: " DB_PWD
DB_PWD=${DB_PWD:-$DEFAULT_DB_PWD}

# 2. Connection Strings
# We assume the service name is kivo-postgresql (standard for this project)
DB_URL="postgres://postgres:$DB_PWD@kivo-postgresql:5432/kivo"
DB_URL_ADMIN="postgres://postgres:$DB_PWD@kivo-postgresql:5432/kivo_admin"

echo "🔐 Creating kivo-db-credentials..."
kubectl create secret generic kivo-db-credentials \
  -n $NAMESPACE \
  --from-literal=DATABASE_URL="$DB_URL" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "🔐 Creating kivo-admin-db-credentials..."
kubectl create secret generic kivo-admin-db-credentials \
  -n $NAMESPACE \
  --from-literal=DATABASE_URL_ADMIN="$DB_URL_ADMIN" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Kivo API Secrets (JWT, Tokens, etc.)
echo "🔐 Preparing kivo-api-staging-secret..."
JWT_SECRET=$(openssl rand -base64 32)
INTERNAL_TOKEN=$(openssl rand -base64 32)

# Check if secret already exists to avoid overwriting existing keys if just updating
if kubectl get secret kivo-api-staging-secret -n $NAMESPACE >/dev/null 2>&1; then
    echo "   -> Secret exists, patching..."
    kubectl patch secret kivo-api-staging-secret -n $NAMESPACE \
      --patch "{\"data\":{\"JWT_SECRET\":\"$(echo -n $JWT_SECRET | base64)\",\"INTERNAL_SERVICE_TOKEN\":\"$(echo -n $INTERNAL_TOKEN | base64)\"}}"
else
    echo "   -> Creating new secret..."
    kubectl create secret generic kivo-api-staging-secret \
      -n $NAMESPACE \
      --from-literal=JWT_SECRET="$JWT_SECRET" \
      --from-literal=INTERNAL_SERVICE_TOKEN="$INTERNAL_TOKEN" \
      --from-literal=PLATFORM_OPENAI_API_KEY="sk-placeholder" \
      --from-literal=PLATFORM_GEMINI_API_KEY="placeholder" \
      --from-literal=RESEND_API_KEY="re-placeholder"
fi

echo "✅ Bootstrap complete! ArgoCD should now be able to sync."
echo "👉 Next step: Run 'make staging-reset' to initialize the databases."
