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
# Default user is 'kivo'
DB_USER="kivo"
DB_URL="postgres://$DB_USER:$DB_PWD@kivo-postgresql:5432/kivo"
DB_URL_ADMIN="postgres://$DB_USER:$DB_PWD@kivo-postgresql:5432/kivo_admin"

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

# 3. Kivo API Secrets (JWT, Tokens, Google, AI)
echo "🔐 Preparing kivo-api-staging-secret..."
JWT_SECRET=$(openssl rand -base64 32)
INTERNAL_TOKEN=$(openssl rand -base64 32)

# Attempt to load values from local .env files to make bootstrap easier
# We check the root .env and the specific app .env files
ENV_FILES=(".env" "apps/admin-api/.env" "apps/kivo-api/.env")
for f in "${ENV_FILES[@]}"; do
    if [ -f "$f" ]; then
        echo "   -> Loading defaults from $f"
        # Extract values using grep/sed (avoiding 'source' to prevent shell side effects)
        export GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-$(grep "^GOOGLE_CLIENT_ID=" "$f" | cut -d'=' -f2- | tr -d '"' | tr -d "'")}
        export GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-$(grep "^GOOGLE_CLIENT_SECRET=" "$f" | cut -d'=' -f2- | tr -d '"' | tr -d "'")}
        export OPENAI_API_KEY=${OPENAI_API_KEY:-$(grep "^OPENAI_API_KEY=" "$f" | head -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")}
        export GEMINI_API_KEY=${GEMINI_API_KEY:-$(grep "^GEMINI_API_KEY=" "$f" | head -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")}
        export RESEND_API_KEY=${RESEND_API_KEY:-$(grep "^RESEND_API_KEY=" "$f" | cut -d'=' -f2- | tr -d '"' | tr -d "'")}
    fi
done

# Prompt for external integration keys (using detected defaults)
echo "--- External Integrations (Detected values will be used if you press Enter) ---"
read -p "Google Client ID [${GOOGLE_CLIENT_ID:0:10}...]: " G_ID
G_ID=${G_ID:-$GOOGLE_CLIENT_ID}
read -p "Google Client Secret [${GOOGLE_CLIENT_SECRET:0:5}...]: " G_SECRET
G_SECRET=${G_SECRET:-$GOOGLE_CLIENT_SECRET}
read -p "OpenAI API Key: " OAI_KEY
OAI_KEY=${OAI_KEY:-$OPENAI_API_KEY}
read -p "Gemini API Key: " GEM_KEY
GEM_KEY=${GEM_KEY:-$GEMINI_API_KEY}
read -p "Resend API Key: " RESEND_KEY
RESEND_KEY=${RESEND_KEY:-$RESEND_API_KEY}

# Helper function to get existing or new value
get_val() {
    local key=$1
    local new_val=$2
    local fallback=$3
    if [ -n "$new_val" ]; then
        echo -n "$new_val" | base64 | tr -d '\n'
    else
        # Try to keep existing if it exists
        local existing=$(kubectl get secret kivo-api-staging-secret -n $NAMESPACE -o jsonpath="{.data.$key}" 2>/dev/null || echo "")
        if [ -n "$existing" ]; then
            echo -n "$existing"
        else
            echo -n "$fallback" | base64 | tr -d '\n'
        fi
    fi
}

B64_JWT=$(get_val "JWT_SECRET" "$JWT_SECRET" "temporary-jwt-secret")
B64_INT=$(get_val "INTERNAL_SERVICE_TOKEN" "$INTERNAL_TOKEN" "temporary-token")
B64_GID=$(get_val "GOOGLE_CLIENT_ID" "$G_ID" "placeholder")
B64_GSEC=$(get_val "GOOGLE_CLIENT_SECRET" "$G_SECRET" "placeholder")
B64_OAI=$(get_val "OPENAI_API_KEY" "$OAI_KEY" "placeholder")
B64_GEM=$(get_val "GEMINI_API_KEY" "$GEM_KEY" "placeholder")
B64_RES=$(get_val "RESEND_API_KEY" "$RESEND_KEY" "placeholder")

cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: kivo-api-staging-secret
  namespace: $NAMESPACE
type: Opaque
data:
  JWT_SECRET: $B64_JWT
  INTERNAL_SERVICE_TOKEN: $B64_INT
  GOOGLE_CLIENT_ID: $B64_GID
  GOOGLE_CLIENT_SECRET: $B64_GSEC
  OPENAI_API_KEY: $B64_OAI
  GEMINI_API_KEY: $B64_GEM
  RESEND_API_KEY: $B64_RES
EOF

echo "✅ Bootstrap complete! ArgoCD should now be able to sync."
echo "👉 Next step: Run 'make staging-reset' to initialize the databases."
