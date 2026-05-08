# Kubernetes Deployment

This document explains the Kubernetes deployment model for Kivo.

## Goal

Package Kivo so it can be deployed into a generic Kubernetes cluster using Helm.

The architecture separates the platform into two primary planes for security and management:
- **Control Plane (`kivo-admin` namespace):** Manages users, workspaces, and global metadata.
- **Application Plane (`kivo` namespace):** Manages teams, agents, and day-to-day operations.

## Helm Chart

The platform is packaged as a single Helm chart located at:
```
charts/kivo/
```

## Basic deployment flow

1. Prepare a Kubernetes cluster.
2. Review and override `values.yaml` for your environment (e.g., `values-uat.yaml`, `values-prod.yaml`).
3. Install with Helm.

```bash
# Example: Install everything
helm upgrade --install kivo ./charts/kivo \
  --namespace kivo \
  --create-namespace \
  -f ./charts/kivo/values-prod.yaml
```

*Note: The chart automatically creates the `kivo-admin` and `kivo` namespaces if configured.*

## Multi-Namespace Architecture

When deployed, Kivo uses several namespaces to isolate different components:

| Namespace | Components | Plane |
|---|---|---|
| `kivo-admin` | `admin-api`, `admin-web` | Control Plane |
| `kivo` | `api`, `kivo-web`, `controller`, `postgresql`, `rabbitmq` | Application Plane |
| `kivo-ws-*` | Isolated namespaces for each customer's agent teams | Execution Cell |

## Component Overview

- **`admin-api`:** Control Plane logic, user authentication, and workspace management.
- **`api`:** Application Plane logic, team management, and agent coordination.
- **`web`:** The SaaS frontend (Next.js).
- **`controller`:** Kubernetes Controller that manages KivoAgent CRDs and provisions workspace namespaces.
- **`postgresql`:** Shared database instance (contains `kivo` and `kivo_admin` databases).
- **`rabbitmq`:** Message bus for agent communication.

## Persistent Storage

Persistence is managed via:
- **PostgreSQL StatefulSet:** Persistent Volume Claims (PVCs) for database state.
- **RabbitMQ StatefulSet:** PVCs for message queues and metadata.
- **Agent Pods:** Each agent pod gets a dedicated PVC for its local workspace and memory state (managed by the controller).

## Database Secrets

The chart expects two separate secrets for database connectivity:
- `kivo-db-credentials`: For the Application Plane (`DATABASE_URL` for `kivo` DB).
- `kivo-admin-db-credentials`: For the Control Plane (`DATABASE_URL_ADMIN` for `kivo_admin` DB).

In staging, these are typically provisioned to point to the same PostgreSQL instance but different logical databases.

## Troubleshooting

```bash
# Check status in both namespaces
kubectl get pods -n kivo
kubectl get pods -n kivo-admin

# Check the controller logs if agents aren't provisioning
kubectl logs -n kivo deployment/kivo-controller

# TOTAL RESET of Staging (Databases + Architecture Sync)
# ☢ WARNING: Wipes all data.
make staging-reset
```
