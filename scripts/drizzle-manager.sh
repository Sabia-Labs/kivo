#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Kivo Drizzle Studio Manager
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TYPE=$1    # kivo | admin
ENV=$2     # local | staging
CTX=$3
NS=$4

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🗄️ Opening Drizzle Studio | Type: $TYPE | Env: $ENV | Context: $CTX"

# Helper to run kubectl in context
k() {
  kubectl --context "$CTX" "$@"
}

APP_DIR="$ROOT_DIR/apps/kivo-api"
URL_VAR="DATABASE_URL"
SECRET_NAME="kivo-db-credentials"
SECRET_KEY="DATABASE_URL"
DEFAULT_LOCAL="postgres://kivo:kivo@localhost:5432/kivo"

if [ "$ENV" = "local" ]; then
  echo "🏠 Running locally..."
  cd "$APP_DIR"
  npm run db:studio
else
  echo "🔌 Connecting to remote database in $ENV..."
  
  # 1. Extract password from secret
  # We assume the secret contains the full connection string
  REMOTE_URL=$(k get secret "$SECRET_NAME" -n "$NS" -o jsonpath="{.data.$SECRET_KEY}" | base64 -d)
  
  # 2. Start port-forward
  LOCAL_PORT=5434
  echo "📡 Port-forwarding kivo-postgresql:5432 to localhost:$LOCAL_PORT..."
  k port-forward svc/kivo-postgresql "$LOCAL_PORT":5432 -n "$NS" > /dev/null 2>&1 &
  PF_PID=$!
  
  # Ensure we kill the port-forward on exit
  trap 'kill $PF_PID' EXIT
  
  sleep 3
  
  # 3. Construct local connection string for the remote DB
  # We replace the remote host/port with localhost:LOCAL_PORT
  # Pattern: postgres://user:pass@host:port/db -> postgres://user:pass@localhost:5434/db
  # Using sed to replace the part between @ and /
  LOCAL_URL=$(echo "$REMOTE_URL" | sed "s/@[^/:]*:[0-9]*/@localhost:$LOCAL_PORT/" | sed "s/@[^/]*\// @localhost:$LOCAL_PORT\//")
  # Fallback if no port was specified in remote URL
  if [[ ! "$LOCAL_URL" == *"$LOCAL_PORT"* ]]; then
     LOCAL_URL=$(echo "$REMOTE_URL" | sed "s/@\(.*\)\// @localhost:$LOCAL_PORT\//")
  fi
  
  echo "🚀 Launching Drizzle Studio..."
  export "$URL_VAR"="$LOCAL_URL"
  cd "$APP_DIR"
  
  # Use npx directly to avoid script overhead
  npx drizzle-kit studio
fi
