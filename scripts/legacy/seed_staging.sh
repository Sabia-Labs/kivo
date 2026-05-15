#!/bin/bash
set -e

DB_PWD=$(kubectl get secret kivo-db-credentials -n kivo-staging -o jsonpath='{.data.DATABASE_URL}' | base64 -d | grep -o ':[^:]*@' | sed 's/://g' | sed 's/@//g')
echo "Extracted password."

# Port forward in background
kubectl port-forward svc/kivo-db-postgresql 5433:5432 -n kivo-staging > /dev/null 2>&1 &
PF_PID=$!
echo "Started port-forward (PID: $PF_PID)."
sleep 5

export DATABASE_URL="postgres://postgres:$DB_PWD@localhost:5433/kivo"
export DATABASE_URL_ADMIN="postgres://postgres:$DB_PWD@localhost:5433/kivo_admin"

echo "Migrating Kivo API..."
cd apps/kivo-api
pnpm install
pnpm db:migrate

echo "Migrating and Seeding Admin API..."
cd ../admin-api
pnpm install
pnpm db:migrate
pnpm db:seed

echo "Killing port-forward..."
kill $PF_PID
echo "Done!"
