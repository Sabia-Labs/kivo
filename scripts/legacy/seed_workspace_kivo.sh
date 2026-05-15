#!/bin/bash
set -e

DB_PWD=$(kubectl get secret kivo-db-credentials -n kivo-staging -o jsonpath='{.data.DATABASE_URL}' | base64 -d | grep -o ':[^:]*@' | sed 's/://g' | sed 's/@//g')
kubectl port-forward svc/kivo-db-postgresql 5433:5432 -n kivo-staging > /dev/null 2>&1 &
PF_PID=$!
sleep 5

export PGPASSWORD=$DB_PWD
psql -h localhost -p 5433 -U postgres -d kivo -c "INSERT INTO workspaces (id, namespace, name, created_at, updated_at) VALUES ('bd4bcf1c-7465-4f3a-ac19-2b2f7eb33e92', 'kivo-ws-4dbc2b65', 'Kivo Demo Workspace', NOW(), NOW()) ON CONFLICT (id) DO NOTHING;"

kill $PF_PID
