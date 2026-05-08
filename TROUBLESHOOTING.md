# Kivo Troubleshooting Guide

This guide provides commands and tips for debugging the Kivo platform. It is focused on application logic, database state, and service communication. 

For infrastructure-specific issues (Terraform, Cloud IAM, Networking), please refer to the `TROUBLESHOOTING.md` in the `sabia-infra` repository.

---

## 🏗 Environments & Contexts

- **Local:** Runs inside Tilt/Docker Desktop. Namespaces: `kivo`, `kivo-admin`.
- **Staging:** Runs on GKE. Namespaces: `kivo-staging`.
- **Production:** TBD.

---

## 📊 Database Debugging (Drizzle Studio)

Kivo uses two logical databases: `kivo` (Application Plane) and `kivo_admin` (Control Plane).

### Local Development (Tilt)

Both databases are port-forwarded automatically by Tilt to `localhost:5432`.

| DB / Plane | Command to Open Studio |
|---|---|
| **kivo** (App) | `cd apps/kivo-api && pnpm drizzle-kit studio` |
| **kivo_admin** (Control) | `cd apps/admin-api && DATABASE_URL_ADMIN="postgres://kivo:kivo@localhost:5432/kivo_admin" npx drizzle-kit studio` |

### Staging Environment

1. **Start Port-forward:**
   ```bash
   kubectl port-forward svc/kivo-db-postgresql 5432:5432 -n kivo-staging
   ```

2. **Open Studio (in a separate terminal):**
   - **Application Plane (`kivo`):**
     ```bash
     cd apps/kivo-api
     DATABASE_URL="postgresql://postgres:[PASSWORD]@localhost:5432/kivo" pnpm drizzle-kit studio
     ```
   - **Control Plane (`kivo_admin`):**
     ```bash
     cd apps/admin-api
     DATABASE_URL_ADMIN="postgresql://postgres:[PASSWORD]@localhost:5432/kivo_admin" npx drizzle-kit studio
     ```

*Note: Get the password from the `kivo-db-credentials` secret in the `kivo-staging` namespace.*

---

## 📜 Viewing Logs

### Local Development
- **Tilt Dashboard:** The best way to see live logs and resource status. Open [http://localhost:10350](http://localhost:10350).
- **Terminal:** `tilt logs -f`

### Staging Environment
- **All Pods in Namespace:**
  ```bash
  kubectl get pods -n kivo-staging
  ```
- **Specific Service Logs:**
  ```bash
  kubectl logs -n kivo-staging deployment/kivo-admin-api -f
  kubectl logs -n kivo-staging deployment/kivo-api -f
  ```
- **Follow Logs from all pods with a specific label:**
  ```bash
  kubectl logs -n kivo-staging -l app.kubernetes.io/name=admin-api -f
  ```

---

## 🛠 Common Issues & Fixes

### 1. Onboarding Error: "Violates foreign key constraint (workspace_id)"
**Symptom:** You can sign up, but the creation of the first team fails.
**Reason:** The `admin-api` failed to notify `kivo-api` to provision the workspace record.
**Check:**
1. Verify if `KIVO_API_INTERNAL_URL` is set correctly in the `admin-api` environment variables.
2. In Staging, it should be `http://kivo-api:4000`.
3. Check `admin-api` logs for "Failed to sync with kivo-api" errors.

### 2. OTP Emails not arriving (Staging)
**Symptom:** Resend says "Suppressed" or the e-mail never arrives.
**Check:**
1. Check the `admin-api` logs for the Resend response.
2. Open **Drizzle Studio** (Control Plane) and look for the code in the `verification_codes` table. You can use this code manually to bypass the email.

### 3. Environment Out of Sync (Staging)
**Symptom:** Strange database errors or missing metadata (Agent Roles, Team Types).
**Fix:** Perform a total reset of the staging environment to align databases and seeds.
```bash
make staging-reset
```

### 4. Connectivity & Network Policies
**Symptom:** Logs show `ConnectTimeoutError` or `UND_ERR_CONNECT_TIMEOUT` when one service tries to call another.
**Reason:** Kubernetes `NetworkPolicies` are likely blocking the traffic.

#### Ingress Issues (Incoming)
- If the **source** service (e.g., `admin-api`) logs a timeout, check the **target** service's (`kivo-api`) Ingress rules.
- Check policies: `kubectl get networkpolicy -n kivo-staging`
- Ensure the source pod is allowed in the ingress rules of the target pod.

#### Egress Issues (Outgoing)
- If a service fails to reach the **Kubernetes API** (e.g., `10.30.0.1:443`) or **RabbitMQ**, check its **Egress** rules.
- Symptom: `Error: connect ETIMEDOUT 10.30.0.1:443` or `RabbitMQ Management API not ready`.
- Fix: Ensure the `egress` section of the `NetworkPolicy` allows traffic to the required ports (443 for K8s, 5672/15672 for RabbitMQ).

---

## 🔍 Service Inspection

### Check Pod Environment Variables
```bash
kubectl exec -n kivo-staging [POD_NAME] -- env | grep DATABASE
```

### Describe a Pod (to see why it's failing to start)
```bash
kubectl describe pod [POD_NAME] -n kivo-staging
```

### Run a temporary psql shell inside the cluster
```bash
kubectl exec -it kivo-db-postgresql-0 -n kivo-staging -- env PGPASSWORD=[PASSWORD] psql -U postgres -d kivo
```
