import { PassThrough } from "stream";
import * as k8s from "@kubernetes/client-node";
import type { Agent } from "../db/schema";
import { kc, coreV1, appsV1, customObjects, KIVO_AI_GROUP, KIVO_AI_VERSION, KIVO_AI_PLURAL } from "./client";

/**
 * Derives the deterministic Kubernetes namespace for a workspace.
 * Pattern: kivo-ws-{workspaceId[:8]}
 * Guaranteed unique (UUID prefix), never changes after creation.
 */
export function workspaceNamespace(workspaceId: string): string {
  return `kivo-ws-${workspaceId.slice(0, 8)}`;
}

/**
 * Ensures the Kubernetes namespace for a workspace exists.
 * Idempotent — safe to call multiple times.
 *
 * @kubernetes/client-node@0.22.x positional arg API:
 *   readNamespace(name: string)
 *   createNamespace(body: V1Namespace)
 */
export async function ensureNamespace(namespace: string): Promise<void> {
  try {
    await coreV1.readNamespace(namespace);
  } catch (err: any) {
    if (httpStatus(err) === 404) {
      await coreV1.createNamespace({
        metadata: {
          name: namespace,
          labels: {
            "app.kubernetes.io/managed-by": "kivo",
            "kivo.ai/component":           "workspace",
          },
        },
      });
    } else {
      throw err;
    }
  }
}

/**
 * Creates or updates the credentials Secret for an agent.
 * Positional API: createNamespacedSecret(namespace, body) / replaceNamespacedSecret(name, namespace, body)
 */
export async function applyCredentialsSecret(
  namespace: string,
  agent: Agent,
): Promise<void> {
  const metadata = (agent.metadata ?? {}) as Record<string, unknown>;
  const name = `${agent.id}-creds`;

  // Platform-level fallbacks — set in kivo-api env via PLATFORM_* vars from .env
  const platformOpenAIKey = process.env.PLATFORM_OPENAI_API_KEY;
  const platformGeminiKey = process.env.PLATFORM_GEMINI_API_KEY;

  const stringData: Record<string, string> = {};
  if (agent.gatewayToken)                    stringData.OPENCLAW_GATEWAY_TOKEN  = agent.gatewayToken;
  if (metadata.telegramBotToken)             stringData.TELEGRAM_BOT_TOKEN      = String(metadata.telegramBotToken);
  if (metadata.linearApiKey)                 stringData.LINEAR_API_KEY           = String(metadata.linearApiKey);
  if (metadata.linearEnabled)                stringData.LINEAR_ENABLED            = String(metadata.linearEnabled);
  if (metadata.githubToken)                  stringData.GITHUB_PERSONAL_ACCESS_TOKEN = String(metadata.githubToken);
  if (metadata.githubEnabled)                stringData.GITHUB_ENABLED            = String(metadata.githubEnabled);
  if (metadata.githubAuthMode)               stringData.GITHUB_AUTH_MODE          = String(metadata.githubAuthMode);
  // Agent-specific key takes priority; fall back to platform key
  const openaiKey = metadata.openaiApiKey ? String(metadata.openaiApiKey) : platformOpenAIKey;
  if (openaiKey)                             stringData.OPENAI_API_KEY            = openaiKey;
  const geminiKey = metadata.geminiApiKey ? String(metadata.geminiApiKey) : platformGeminiKey;
  if (geminiKey)                             stringData.GEMINI_API_KEY            = geminiKey;

  const secretBody = {
    metadata: {
      name,
      namespace,
      labels: {
        "app.kubernetes.io/managed-by": "kivo",
        "kivo.ai/agent-id":            agent.id,
      },
    },
    stringData,
  };

  try {
    const { body: existingSecret } = await coreV1.readNamespacedSecret(name, namespace);
    // Exists — carry resourceVersion for optimistic concurrency control (required by k8s PUT)
    (secretBody.metadata as any).resourceVersion = existingSecret.metadata?.resourceVersion;
    await coreV1.replaceNamespacedSecret(name, namespace, secretBody);
  } catch (err: any) {
    if (httpStatus(err) === 404) {
      await coreV1.createNamespacedSecret(namespace, secretBody);
    } else {
      throw err;
    }
  }
}

/**
 * Applies the KivoAgent Custom Resource (create-or-replace semantics).
 * Uses create → 409 conflict → get resourceVersion → replace to avoid PATCH Content-Type issues.
 */
export async function applyKivoAgentCR(
  namespace: string,
  agent: Agent,
  workspaceId: string,
  teamName = "",
): Promise<void> {
  const metadata = (agent.metadata ?? {}) as Record<string, unknown>;
  const name = agent.id;

  const crBody: Record<string, unknown> = {
    apiVersion: `${KIVO_AI_GROUP}/${KIVO_AI_VERSION}`,
    kind: "Agent",
    metadata: {
      name,
      namespace,
      labels: {
        "app.kubernetes.io/managed-by": "kivo",
        "kivo.ai/agent-id":            agent.id,
        "kivo.ai/workspace-id":        workspaceId,
        "kivo.ai/profile":             agent.type,
      },
      annotations: {
        "kivo.ai/agent-name": agent.name,
      },
    },
    spec: {
      agentName:            agent.name,
      profile:              agent.type,
      operatorName:         String(metadata.operatorName ?? ""),
      teamName:             teamName,
      teamId:               agent.teamId,
      credentialsSecretRef: `${agent.id}-creds`,
      model: {
        provider: String(metadata.modelProvider ?? process.env.PLATFORM_MODEL_PROVIDER ?? "openai"),
        name:     String(metadata.modelName     ?? process.env.PLATFORM_MODEL_NAME     ?? "gpt-5.4"),
      },
      resources: {
        requests: { cpu: "250m",  memory: "512Mi" },
        limits:   { cpu: "1000m", memory: "2Gi"   },
      },
      persistence: { size: "10Gi" },
    },
  };

  try {
    await customObjects.createNamespacedCustomObject(
      KIVO_AI_GROUP, KIVO_AI_VERSION, namespace, KIVO_AI_PLURAL, crBody,
    );
  } catch (err: any) {
    if (httpStatus(err) === 409) {
      // Already exists — replace (requires current resourceVersion for optimistic lock)
      const { body: existing } = await customObjects.getNamespacedCustomObject(
        KIVO_AI_GROUP, KIVO_AI_VERSION, namespace, KIVO_AI_PLURAL, name,
      ) as any;
      (crBody.metadata as any).resourceVersion = existing.metadata?.resourceVersion;

      await customObjects.replaceNamespacedCustomObject(
        KIVO_AI_GROUP, KIVO_AI_VERSION, namespace, KIVO_AI_PLURAL, name, crBody,
      );
    } else {
      throw err;
    }
  }
}

/**
 * Deletes the KivoAgent CR. K8s GC cascades to all child resources (ownerReferences).
 * Idempotent — 404 is treated as success.
 */
export async function deleteKivoAgentCR(namespace: string, agentId: string): Promise<void> {
  try {
    await customObjects.deleteNamespacedCustomObject(
      KIVO_AI_GROUP, KIVO_AI_VERSION, namespace, KIVO_AI_PLURAL, agentId,
    );
  } catch (err: any) {
    if (httpStatus(err) !== 404) throw err;
  }
}

/**
 * Deletes the agent credentials Secret.
 */
export async function deleteCredentialsSecret(namespace: string, agentId: string): Promise<void> {
  try {
    await coreV1.deleteNamespacedSecret(`${agentId}-creds`, namespace);
  } catch (err: any) {
    if (httpStatus(err) !== 404) throw err;
  }
}

/**
 * Creates or updates the `rabbitmq-credentials` Secret in the workspace namespace.
 *
 * This Secret is consumed by:
 *  - The kivo-consumer sidecar (AMQP connection to workspace vhost)
 *  - The openclaw container (optional — for environment awareness)
 *
 * Named `rabbitmq-credentials` (stable, not agent-scoped) because all agents
 * in the same namespace share the same workspace vhost.
 */
export async function applyRabbitMQCredentialsSecret(
  namespace: string,
  creds: {
    host: string;
    amqpPort: number;
    vhost: string;
    username: string;
    password: string;
    exchange: string;
  },
): Promise<void> {
  const name = "rabbitmq-credentials";

  const secretBody = {
    metadata: {
      name,
      namespace,
      labels: {
        "app.kubernetes.io/managed-by": "kivo",
        "kivo.ai/component":           "message-bus",
      },
    },
    stringData: {
      RABBITMQ_HOST:     creds.host,
      RABBITMQ_AMQP_PORT: String(creds.amqpPort),
      RABBITMQ_VHOST:    creds.vhost,
      RABBITMQ_USERNAME: creds.username,
      RABBITMQ_PASSWORD: creds.password,
      RABBITMQ_EXCHANGE: creds.exchange,
    },
  };

  try {
    const { body: existing } = await coreV1.readNamespacedSecret(name, namespace);
    (secretBody.metadata as any).resourceVersion = existing.metadata?.resourceVersion;
    await coreV1.replaceNamespacedSecret(name, namespace, secretBody);
  } catch (err: any) {
    if (httpStatus(err) === 404) {
      await coreV1.createNamespacedSecret(namespace, secretBody);
    } else {
      throw err;
    }
  }
}

/**
 * Reads the live status of a KivoAgent CR. Returns null if not found.
 */
export async function getKivoAgentStatus(
  namespace: string,
  agentId: string,
): Promise<{ phase: string; podName?: string; conditions?: unknown[] } | null> {
  try {
    const { body: cr } = await customObjects.getNamespacedCustomObject(
      KIVO_AI_GROUP, KIVO_AI_VERSION, namespace, KIVO_AI_PLURAL, agentId,
    ) as any;
    return cr?.status ?? { phase: "Pending" };
  } catch (err: any) {
    if (httpStatus(err) === 404) return null;
    throw err;
  }
}

/**
 * Triggers a rolling restart of the agent's Deployment by patching the pod
 * template annotation `kubectl.kubernetes.io/restartedAt` with the current
 * timestamp. Equivalent to `kubectl rollout restart deployment/<agentId>`.
 *
 * The new ReplicaSet causes the initContainer (bootstrap.sh) to run again on
 * each fresh pod, which (re-)configures the Telegram channel with the updated
 * TELEGRAM_BOT_TOKEN from the credentials Secret.
 */
export async function rolloutRestartDeployment(
  namespace: string,
  agentId: string,
): Promise<void> {
  const patch = {
    spec: {
      template: {
        metadata: {
          annotations: {
            "kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
          },
        },
      },
    },
  };

  await appsV1.patchNamespacedDeployment(
    agentId,
    namespace,
    patch,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { headers: { "Content-Type": "application/strategic-merge-patch+json" } },
  );
}

/**
 * Executes a command inside the running agent pod's "kivo" container.
 * Used for operations like `openclaw pairing approve telegram <code>`.
 *
 * Uses the Kubernetes Exec API (WebSocket) via @kubernetes/client-node.
 * Throws with a human-readable message if the pod is not found or the
 * command fails.
 */
export async function execInAgentPod(
  namespace: string,
  agentId: string,
  command: string[],
): Promise<string> {
  // Locate the running pod for this agent via its label
  const { body: podList } = await coreV1.listNamespacedPod(
    namespace,
    undefined, undefined, undefined, undefined,
    `kivo.ai/agent-id=${agentId}`,
  );

  const pod = podList.items.find((p) => p.status?.phase === "Running");
  if (!pod?.metadata?.name) {
    throw new Error(`No running pod found for agent ${agentId} in namespace ${namespace}`);
  }

  const podName = pod.metadata!.name!;
  const exec    = new k8s.Exec(kc);
  let stdout = "";
  let stderr = "";

  await new Promise<void>((resolve, reject) => {
    const outStream = new PassThrough();
    const errStream = new PassThrough();
    outStream.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    errStream.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const wsPromise = exec.exec(
      namespace,
      podName,
      "kivo",
      command,
      outStream,
      errStream,
      null,
      false,
      (status: k8s.V1Status) => {
        if (status.status === "Success") {
          resolve();
        } else {
          reject(new Error(
            stderr.trim() ||
            status.message ||
            `Command failed with status: ${status.reason ?? "Unknown"}`
          ));
        }
      },
    );

    // The exec() call itself returns a Promise<WebSocket>. If the WS
    // handshake fails (e.g. 403, 404) the promise rejects before the
    // status callback fires — surface that as a readable error.
    wsPromise.catch((wsErr: unknown) => {
      const msg = wsErr instanceof Error
        ? wsErr.message
        : String(wsErr);
      console.error(`[execInAgentPod] WebSocket error for ${podName}:`, msg);
      reject(new Error(`Could not connect to pod (${msg}). Check RBAC and pod readiness.`));
    });
  });

  return stdout.trim();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts the HTTP status code from a @kubernetes/client-node error.
 * The error shape varies by library version; this handles both styles.
 */
function httpStatus(err: any): number {
  return err?.response?.statusCode       // axios-style (older versions)
    ?? err?.body?.code                   // K8s API body code
    ?? err?.statusCode                   // direct property
    ?? 0;
}
