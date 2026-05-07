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

echo "Seeding Kivo API Application Plane..."
cd apps/kivo-api
pnpm install
pnpm db:seed bd4bcf1c-7465-4f3a-ac19-2b2f7eb33e92

echo "Killing port-forward..."
kill $PF_PID
echo "Done!"
