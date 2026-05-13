#!/bin/bash
# ☢ WARNING: THIS SCRIPT WIPES ALL STAGING DATABASES (kivo & kivo_admin)
# It ensures the architecture is correctly split between Control and Application Plane.
# UPDATED: Now also cleans up all ephemeral kivo-ws-* namespaces.

set -e

NAMESPACE="kivo-staging"
POSTGRES_POD="kivo-postgresql-0"
POSTGRES_SVC="kivo-postgresql"
DB_USER="kivo" # Default user defined in Helm charts/kivo/values.yaml

echo "🧹 Cleaning up workspace namespaces (kivo-ws-*)..."
kubectl get namespace -o name | grep 'namespace/kivo-ws-' | xargs -r kubectl delete --ignore-not-found || true

echo "📉 Scaling down apps to release DB locks..."
kubectl scale deployment kivo-api kivo-admin-api kivo-web kivo-admin-web -n $NAMESPACE --replicas=0
echo "Waiting for pods to terminate..."
sleep 10

echo "🔐 Extracting Postgres credentials from cluster..."
# Try to get it from kivo-db-credentials first, then fallback to default if not found
DB_PWD=$(kubectl get secret kivo-db-credentials -n $NAMESPACE -o jsonpath='{.data.DATABASE_URL}' 2>/dev/null | base64 -d | grep -o ':[^:]*@' | sed 's/://g' | sed 's/@//g')

if [ -z "$DB_PWD" ]; then
    echo "⚠️  Could not extract password from secret. Re-running with default password..."
    DB_PWD="kivo_local_only"
fi

echo "🧹 Dropping and recreating databases (executing inside pod $POSTGRES_POD)..."
# Usamos o usuário 'kivo' e conectamos ao banco 'kivo' (que o Helm cria por padrão)
kubectl exec -n $NAMESPACE $POSTGRES_POD -- env PGPASSWORD=$DB_PWD psql -U $DB_USER -d $DB_USER -c "DROP DATABASE IF EXISTS kivo_admin WITH (FORCE);"
kubectl exec -n $NAMESPACE $POSTGRES_POD -- env PGPASSWORD=$DB_PWD psql -U $DB_USER -d $DB_USER -c "CREATE DATABASE kivo_admin;"
# O banco 'kivo' nós não dropamos (pois estamos conectados a ele), apenas limpamos se necessário, 
# ou dropamos conectando ao recém criado 'kivo_admin'
kubectl exec -n $NAMESPACE $POSTGRES_POD -- env PGPASSWORD=$DB_PWD psql -U $DB_USER -d kivo_admin -c "DROP DATABASE IF EXISTS kivo WITH (FORCE);"
kubectl exec -n $NAMESPACE $POSTGRES_POD -- env PGPASSWORD=$DB_PWD psql -U $DB_USER -d kivo_admin -c "CREATE DATABASE kivo;"

# Agora precisamos do port-forward apenas para as migrações que rodam LOCALMENTE
echo "🔌 Starting temporary port-forward for migrations..."
kubectl port-forward svc/$POSTGRES_SVC 5433:5432 -n $NAMESPACE > /dev/null 2>&1 &
PF_PID=$!
sleep 5

# Connection strings para o Drizzle (que roda na sua máquina)
DB_BASE="postgres://$DB_USER:$DB_PWD@localhost:5433"
export DATABASE_URL="$DB_BASE/kivo"
export DATABASE_URL_ADMIN="$DB_BASE/kivo_admin"

echo "🏗 Running migrations and SEED for Kivo API (Application Plane)..."
cd apps/kivo-api && pnpm install && pnpm db:migrate && pnpm db:seed && cd ../..

echo "🏗 Running migrations and SEED for Admin API (Control Plane)..."
cd apps/admin-api && npm install && npm run db:migrate && npm run db:seed && cd ../..

echo "🛠 Creating/Updating separate Secret for Admin API DB..."
NEW_URL_ADMIN=$(echo -n "postgres://$DB_USER:$DB_PWD@$POSTGRES_SVC:5432/kivo_admin" | base64)
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: kivo-admin-db-credentials
  namespace: $NAMESPACE
type: Opaque
data:
  DATABASE_URL_ADMIN: $NEW_URL_ADMIN
EOF

echo "🔐 Ensuring INTERNAL_SERVICE_TOKEN exists for inter-service sync..."
# Try to get existing token from cluster to avoid rotation on every reset
EXISTING_TOKEN=$(kubectl get secret kivo-api-staging-secret -n $NAMESPACE -o jsonpath='{.data.INTERNAL_SERVICE_TOKEN}' 2>/dev/null | base64 -d || echo "")
if [ -z "$EXISTING_TOKEN" ]; then
    echo "   -> Generating new internal service token..."
    INTERNAL_TOKEN=$(openssl rand -base64 32)
else
    echo "   -> Using existing internal service token."
    INTERNAL_TOKEN="$EXISTING_TOKEN"
fi

# Surgical patch to add/update the token without wiping other keys (like JWT_SECRET)
B64_TOKEN=$(echo -n "$INTERNAL_TOKEN" | base64 | tr -d '\n')
kubectl patch secret kivo-api-staging-secret -n $NAMESPACE --type='json' -p="[{\"op\": \"replace\", \"path\": \"/data/INTERNAL_SERVICE_TOKEN\", \"value\": \"$B64_TOKEN\"}]" 2>/dev/null || \
kubectl patch secret kivo-api-staging-secret -n $NAMESPACE --type='json' -p="[{\"op\": \"add\", \"path\": \"/data/INTERNAL_SERVICE_TOKEN\", \"value\": \"$B64_TOKEN\"}]" 2>/dev/null || \
kubectl create secret generic kivo-api-staging-secret -n $NAMESPACE --from-literal=INTERNAL_SERVICE_TOKEN="$INTERNAL_TOKEN" --dry-run=client -o yaml | kubectl apply -f -

echo "📈 Scaling up apps..."
kubectl scale deployment kivo-api kivo-admin-api kivo-web kivo-admin-web -n $NAMESPACE --replicas=1

kill $PF_PID
echo "✨ STAGING RESET COMPLETE! Both planes are now in their own databases and K8s resources are clean."
