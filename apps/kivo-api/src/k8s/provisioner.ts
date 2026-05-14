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

  // Platform-level fallbacks — set in kivo-api env via PLATFORM_* vars from .env (Local)
  // or via OPENAI_API_KEY / GEMINI_API_KEY (Staging/Prod via Helm)
  const platformOpenAIKey = process.env.OPENAI_API_KEY || process.env.PLATFORM_OPENAI_API_KEY;
  const platformGeminiKey = process.env.GEMINI_API_KEY || process.env.PLATFORM_GEMINI_API_KEY;
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN;

  // Determine the internal API URL for the sidecar to talk back.
  // In Kubernetes, if they share a namespace or we use a fixed service name:
  const apiInternalUrl = process.env.KIVO_API_INTERNAL_URL || `http://kivo-api.${process.env.KIVO_NAMESPACE || "kivo"}:4000`;

  const stringData: Record<string, string> = {};
  if (agent.gatewayToken)                    stringData.OPENCLAW_GATEWAY_TOKEN  = agent.gatewayToken;
  if (internalToken)                         stringData.INTERNAL_SERVICE_TOKEN  = internalToken;
  if (apiInternalUrl)                        stringData.KIVO_API_INTERNAL_URL   = apiInternalUrl;
  
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
        "kivo.ai/profile":             agent.roleId || "agent",
      },
      annotations: {
        "kivo.ai/agent-name": agent.name,
      },
    },
    spec: {
      agentName:            agent.name,
      profile:              agent.roleId || "agent",
      operatorName:         String(metadata.operatorName ?? ""),
      teamName:             teamName,
      teamId:               agent.teamId,
      credentialsSecretRef: `${agent.id}-creds`,
      model: {
        provider: String(metadata.modelProvider ?? process.env.PLATFORM_MODEL_PROVIDER ?? "openai"),
        name:     String(metadata.modelName     ?? process.env.PLATFORM_MODEL_NAME     ?? "gpt-5.4"),
      },
      resources: {
        requests: { cpu: "250m", memory: "512Mi" },
        limits:   { cpu: "1000m", memory: "2Gi"   },
      },
      persistence: { 
        size: "1Gi",
        storageClassName: "standard"
      },
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

/**
 * Retrieves the internal IP of an agent's Pod from the Agent CR status.
 */
export async function getAgentPodIP(
  namespace: string,
  agentId: string,
): Promise<string | null> {
  try {
    const { body: cr } = await customObjects.getNamespacedCustomObject(
      KIVO_AI_GROUP, KIVO_AI_VERSION, namespace, KIVO_AI_PLURAL, agentId,
    ) as any;
    
    return cr?.status?.podIP || null;
  } catch (err: any) {
    if (httpStatus(err) === 404) return null;
    throw err;
  }
}

/**
 * Delivers a message to an agent's sidecar (consumer) via direct HTTP POST.
 * Replaces RabbitMQ publishing.
 */
export async function deliverMessageToAgent(
  namespace: string,
  agentId: string,
  payload: { sessionKey: string; content: string; messageId: string },
): Promise<boolean> {
  const podIP = await getAgentPodIP(namespace, agentId);
  if (!podIP) {
    console.warn(`[delivery] Cannot deliver: No Pod IP found for agent ${agentId} in ${namespace}`);
    return false;
  }

  const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;
  const url = `http://${podIP}:43124/v1/inbound/message`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": INTERNAL_TOKEN || "",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log(`[delivery] Successfully pushed message to agent ${agentId} at ${podIP}`);
      return true;
    } else {
      console.error(`[delivery] Failed to push to agent ${agentId}: ${res.status} ${res.statusText}`);
      return false;
    }
  } catch (err) {
    console.error(`[delivery] Network error pushing to agent ${agentId} at ${podIP}:`, err);
    return false;
  }
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
