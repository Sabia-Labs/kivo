#!/bin/bash
# ☢ WARNING: THIS SCRIPT WIPES ALL STAGING DATABASES (kivo & kivo_admin)
# It ensures the architecture is correctly split between Control and Application Plane.

set -e

NAMESPACE="kivo-staging"
POSTGRES_POD="kivo-db-postgresql-0"

echo "🔐 Extracting Postgres credentials from cluster..."
DB_PWD=$(kubectl get secret kivo-db-credentials -n $NAMESPACE -o jsonpath='{.data.DATABASE_URL}' | base64 -d | grep -o ':[^:]*@' | sed 's/://g' | sed 's/@//g')

echo "🧹 Dropping and recreating databases (executing inside pod)..."
# Usamos kubectl exec para rodar o psql dentro do pod do Postgres
kubectl exec -n $NAMESPACE $POSTGRES_POD -- env PGPASSWORD=$DB_PWD psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS kivo;"
kubectl exec -n $NAMESPACE $POSTGRES_POD -- env PGPASSWORD=$DB_PWD psql -U postgres -d postgres -c "CREATE DATABASE kivo;"
kubectl exec -n $NAMESPACE $POSTGRES_POD -- env PGPASSWORD=$DB_PWD psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS kivo_admin;"
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

echo "🏗 Running migrations for both planes..."
cd apps/kivo-api && pnpm install && pnpm db:migrate && cd ../..
cd apps/admin-api && npm install && npm run db:migrate && cd ../..

echo "🌱 Seeding Admin API (Control Plane)..."
ADMIN_SEED_OUTPUT=$(cd apps/admin-api && npm run db:seed)
echo "$ADMIN_SEED_OUTPUT"

# Capturar o WORKSPACE_ID gerado
WORKSPACE_ID=$(echo "$ADMIN_SEED_OUTPUT" | grep "Workspace created:" | awk '{print $4}')

if [ -n "$WORKSPACE_ID" ]; then
  echo "🌱 Seeding Kivo API (Application Plane) for Workspace $WORKSPACE_ID..."
  cd apps/kivo-api && pnpm db:seed "$WORKSPACE_ID" && cd ../..
else
  echo "⚠️ Could not extract WORKSPACE_ID. Skipping Application Plane seed."
fi

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

echo "🔄 Restarting pods to apply the new split architecture..."
kubectl rollout restart deployment kivo-admin-api -n $NAMESPACE
kubectl rollout restart deployment kivo-api -n $NAMESPACE

kill $PF_PID
echo "✨ STAGING RESET COMPLETE! Both planes are now in their own databases and seeded."
