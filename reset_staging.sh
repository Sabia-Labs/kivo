#!/bin/bash
# ☢ WARNING: THIS SCRIPT WIPES ALL STAGING DATABASES (kivo & kivo_admin)
# It ensures the architecture is correctly split between Control and Application Plane.
# UPDATED: Now also cleans up all ephemeral kivo-ws-* namespaces.

set -e

NAMESPACE="kivo-staging"
POSTGRES_POD="kivo-db-postgresql-0"

echo "🧹 Cleaning up workspace namespaces (kivo-ws-*)..."
kubectl get namespace -o name | grep 'namespace/kivo-ws-' | xargs -r kubectl delete --ignore-not-found || true

echo "📉 Scaling down apps to release DB locks..."
kubectl scale deployment kivo-api kivo-admin-api kivo-web kivo-admin-web -n $NAMESPACE --replicas=0
echo "Waiting for pods to terminate..."
sleep 10

echo "🔐 Extracting Postgres credentials from cluster..."
DB_PWD=$(kubectl get secret kivo-db-credentials -n $NAMESPACE -o jsonpath='{.data.DATABASE_URL}' | base64 -d | grep -o ':[^:]*@' | sed 's/://g' | sed 's/@//g')

echo "🧹 Dropping and recreating databases (executing inside pod)..."
# Usamos kubectl exec para rodar o psql dentro do pod do Postgres
# Forçamos o drop mesmo que haja conexões residuais (embora o scale down deva evitar isso)
kubectl exec -n $NAMESPACE $POSTGRES_POD -- env PGPASSWORD=$DB_PWD psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS kivo WITH (FORCE);"
kubectl exec -n $NAMESPACE $POSTGRES_POD -- env PGPASSWORD=$DB_PWD psql -U postgres -d postgres -c "CREATE DATABASE kivo;"
kubectl exec -n $NAMESPACE $POSTGRES_POD -- env PGPASSWORD=$DB_PWD psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS kivo_admin WITH (FORCE);"
kubectl exec -n $NAMESPACE $POSTGRES_POD -- env PGPASSWORD=$DB_PWD psql -U postgres -d postgres -c "CREATE DATABASE kivo_admin;"

# Agora precisamos do port-forward apenas para as migrações que rodam LOCALMENTE
echo "🔌 Starting temporary port-forward for migrations..."
kubectl port-forward svc/kivo-db-postgresql 5433:5432 -n $NAMESPACE > /dev/null 2>&1 &
PF_PID=$!
sleep 5

# Connection strings para o Drizzle (que roda na sua máquina)
DB_BASE="postgres://postgres:$DB_PWD@localhost:5433"
export DATABASE_URL="$DB_BASE/kivo"
export DATABASE_URL_ADMIN="$DB_BASE/kivo_admin"

echo "🏗 Running migrations and SEED for Kivo API (Application Plane)..."
cd apps/kivo-api && pnpm install && pnpm db:migrate && pnpm db:seed && cd ../..

echo "🏗 Running migrations and SEED for Admin API (Control Plane)..."
cd apps/admin-api && npm install && npm run db:migrate && npm run db:seed && cd ../..

echo "🛠 Creating/Updating separate Secret for Admin API..."
NEW_URL_ADMIN=$(echo -n "postgres://postgres:$DB_PWD@kivo-db-postgresql:5432/kivo_admin" | base64)
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

echo "📈 Scaling up apps..."
kubectl scale deployment kivo-api kivo-admin-api kivo-web kivo-admin-web -n $NAMESPACE --replicas=1

kill $PF_PID
echo "✨ STAGING RESET COMPLETE! Both planes are now in their own databases and K8s resources are clean."
