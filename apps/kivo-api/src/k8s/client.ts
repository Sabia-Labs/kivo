import { existsSync } from "fs";
import * as k8s from "@kubernetes/client-node";

/**
 * Singleton Kubernetes client configured from the environment.
 * - Inside the cluster: reads the mounted ServiceAccount token via loadFromCluster().
 *   We check for the SA token file explicitly because loadFromDefault() inside
 *   a Tilt-managed pod loads the injected kubeconfig (no user token), which
 *   works for REST calls but causes 403 on WebSocket Exec requests.
 * - Outside the cluster (local dev / Tilt): reads ~/.kube/config.
 */

const SA_TOKEN_FILE = "/var/run/secrets/kubernetes.io/serviceaccount/token";

const kc = new k8s.KubeConfig();
if (existsSync(SA_TOKEN_FILE)) {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}

export { kc };

/** Core V1 API — Namespaces, Secrets, ConfigMaps */
export const coreV1 = kc.makeApiClient(k8s.CoreV1Api);

/** Apps V1 API — Deployments */
export const appsV1 = kc.makeApiClient(k8s.AppsV1Api);

/** Batch V1 API — CronJobs */
export const batchV1 = kc.makeApiClient(k8s.BatchV1Api);

/** Custom Objects API — KivoAgent CRs */
export const customObjects = kc.makeApiClient(k8s.CustomObjectsApi);

export const KIVO_AI_GROUP   = "kivo.ai";
export const KIVO_AI_VERSION = "v1alpha1";
export const KIVO_AI_PLURAL  = "agents";
