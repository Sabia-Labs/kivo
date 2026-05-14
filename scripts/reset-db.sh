#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Kivo Database Reset (Generalized)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV=$1
CTX=$2
NS=$3

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
POSTGRES_POD="kivo-postgresql-0"
POSTGRES_SVC="kivo-postgresql"
DB_USER="kivo"

echo "🧹 Resetting databases in $ENV (Context: $CTX, NS: $NS)..."

# Helper to run kubectl in context
k() {
  kubectl --context "$CTX" "$@"
}

# 1. Extract Credentials
echo "🔐 Extracting Postgres credentials..."
DB_PWD=$(k get secret kivo-db-credentials -n "$NS" -o jsonpath='{.data.DATABASE_URL}' 2>/dev/null | base64 -d | grep -o ':[^:]*@' | sed 's/://g' | sed 's/@//g' || echo "kivo_local_only")

# 2. Drop and Recreate Databases
echo "🧹 Dropping and recreating databases inside pod $POSTGRES_POD..."
k exec -n "$NS" "$POSTGRES_POD" -- env PGPASSWORD="$DB_PWD" psql -U "$DB_USER" -d "$DB_USER" -c "DROP DATABASE IF EXISTS kivo_admin WITH (FORCE);" || true
k exec -n "$NS" "$POSTGRES_POD" -- env PGPASSWORD="$DB_PWD" psql -U "$DB_USER" -d "$DB_USER" -c "CREATE DATABASE kivo_admin;"

k exec -n "$NS" "$POSTGRES_POD" -- env PGPASSWORD="$DB_PWD" psql -U "$DB_USER" -d kivo_admin -c "DROP DATABASE IF EXISTS kivo WITH (FORCE);" || true
k exec -n "$NS" "$POSTGRES_POD" -- env PGPASSWORD="$DB_PWD" psql -U "$DB_USER" -d kivo_admin -c "CREATE DATABASE kivo;"

# 3. Port-forward for migrations
echo "🔌 Starting temporary port-forward..."
LOCAL_PORT=5433
k port-forward svc/"$POSTGRES_SVC" "$LOCAL_PORT":5432 -n "$NS" > /dev/null 2>&1 &
PF_PID=$!
sleep 5

# 4. Run Migrations & Seed
DB_BASE="postgres://$DB_USER:$DB_PWD@localhost:$LOCAL_PORT"
export DATABASE_URL="$DB_BASE/kivo"
export DATABASE_URL_ADMIN="$DB_BASE/kivo_admin"

echo "🏗 Running migrations and SEED..."
(cd "$ROOT_DIR/apps/kivo-api" && pnpm db:migrate && pnpm db:seed)
(cd "$ROOT_DIR/apps/admin-api" && npm run db:migrate && npm run db:seed)

# 5. Update Secret for Admin API (Internal DB URL)
echo "🛠 Updating internal credentials..."
NEW_URL_ADMIN=$(echo -n "postgres://$DB_USER:$DB_PWD@$POSTGRES_SVC:5432/kivo_admin" | base64)
k patch secret kivo-admin-db-credentials -n "$NS" -p "{\"data\":{\"DATABASE_URL_ADMIN\":\"$NEW_URL_ADMIN\"}}"

# Cleanup
kill $PF_PID || true
echo "✨ DB Reset complete for $ENV."
