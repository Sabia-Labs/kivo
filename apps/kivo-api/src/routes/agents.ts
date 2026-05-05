import { randomBytes } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, count } from "drizzle-orm";
import { db } from "../db/client";
import { agents, workspaces, teams } from "../db/schema";
import { createAgentSchema, updateAgentSchema } from "../schemas/agent.schema";
import { success, failure } from "../lib/response";
import {
  workspaceNamespace,
  ensureNamespace,
  applyCredentialsSecret,
  applyKivoAgentCR,
  applyRabbitMQCredentialsSecret,
  deleteKivoAgentCR,
  deleteCredentialsSecret,
  rolloutRestartDeployment,
  execInAgentPod,
  getKivoAgentStatus,
} from "../k8s/provisioner";
import {
  provisionTenant,
  deprovisionTenant,
  publishToAgent,
  tenantVhost,
  tenantUser,
  tenantExchange,
} from "../lib/rabbitmq";

export const agentsRouter = Router();

// ── POST /agents ──────────────────────────────────────────────────────────────
// 1. Validates input and inserts agent into postgres (k8sStatus = "pending").
// 2. Resolves the workspace namespace (creates it if needed).
// 3. Applies the credentials Secret and the KivoAgent CR (desired state).
// The Agent Controller reconciles the actual K8s runtime resources.

agentsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createAgentSchema.parse(req.body);

    // ── 1. Resolve workspace via team ────────────────────────────────────────
    const [team] = await db.select().from(teams).where(eq(teams.id, input.teamId));
    if (!team) {
      res.status(400).json(failure("Team not found"));
      return;
    }

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, team.workspaceId));
    if (!workspace) {
      res.status(400).json(failure("Workspace not found"));
      return;
    }

    // ── 2. Derive/persist namespace if missing ────────────────────────────────
    const namespace = workspace.k8sNamespace ?? workspaceNamespace(workspace.id);

    if (!workspace.k8sNamespace) {
      await db
        .update(workspaces)
        .set({ k8sNamespace: namespace })
        .where(eq(workspaces.id, workspace.id));
    }

    // ── 3. Insert agent with gateway token + pending k8s status ──────────────
    // gatewayToken is generated once here and never changed — the same token
    // persists across pod restarts since openclaw stores its state on the PVC.
    const gatewayToken = randomBytes(32).toString("base64url");

    const [agent] = await db
      .insert(agents)
      .values({
        ...input,
        gatewayToken,
        k8sStatus: "pending",
      })
      .returning();

    // ── 4. Provision K8s desired state (non-blocking on errors — agent exists) ─
    try {
      await ensureNamespace(namespace);
      await applyCredentialsSecret(namespace, agent);
      await applyKivoAgentCR(namespace, agent, workspace.id, team.name);

      // ── 4b. Provision RabbitMQ tenant (vhost + user + exchange) ─────────────
      // Idempotent — safe to call on every agent creation in the same workspace.
      // The vhost is workspace-scoped, so this is a no-op if already provisioned.
      try {
        const rabbitCreds = await provisionTenant(workspace.id);
        await applyRabbitMQCredentialsSecret(namespace, rabbitCreds);
        console.log(`[agents] RabbitMQ tenant provisioned for workspace ${workspace.id}`);
      } catch (rabbitErr) {
        console.error("[agents] RabbitMQ provisioning failed (non-fatal):", rabbitErr);
        // Non-fatal: agent still works without messaging; ops can re-provision manually
      }

      // Store CR name (= agent UUID) on the DB record
      await db
        .update(agents)
        .set({ k8sStatus: "provisioning", k8sResourceName: agent.id })
        .where(eq(agents.id, agent.id));

      agent.k8sStatus      = "provisioning";
      agent.k8sResourceName = agent.id;
    } catch (k8sErr) {
      console.error("[agents] K8s provisioning failed — agent created but not scheduled:", k8sErr);
      await db.update(agents).set({ k8sStatus: "failed" }).where(eq(agents.id, agent.id));
      agent.k8sStatus = "failed";
    }

    res.status(201).json(success(agent));
  } catch (err) {
    next(err);
  }
});

// ── GET /agents ───────────────────────────────────────────────────────────────
// Supports optional ?teamId= filter.

agentsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId } = req.query;

    const rows = teamId
      ? await db
          .select()
          .from(agents)
          .where(eq(agents.teamId, String(teamId)))
          .orderBy(agents.createdAt)
      : await db.select().from(agents).orderBy(agents.createdAt);

    res.json(success(rows));
  } catch (err) {
    next(err);
  }
});

// ── GET /agents/:id ───────────────────────────────────────────────────────────
// Enriches the DB record with the live cr.status from the cluster.

agentsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, String(req.params.id)));

    if (!agent) {
      res.status(404).json(failure("Agent not found"));
      return;
    }

    // Enrich with live cluster status if agent has been provisioned
    let liveStatus: unknown = null;
    if (agent.k8sResourceName) {
      try {
        const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId));
        const [workspace] = team
          ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId))
          : [];

        if (workspace?.k8sNamespace) {
          liveStatus = await getKivoAgentStatus(workspace.k8sNamespace, agent.id);
        }
      } catch {
        // Non-fatal: cluster may be unreachable
      }
    }

    // Sanitize metadata: strip telegramBotToken, expose hasTelegramToken boolean.
    // All other metadata fields are safe and returned as-is.
    const { gatewayToken: _gt, ...safeAgent } = agent as any;
    if (safeAgent.metadata) {
      const { telegramBotToken: _tok, ...safeMeta } = safeAgent.metadata as Record<string, unknown>;
      safeAgent.metadata = { ...safeMeta, hasTelegramToken: Boolean(_tok) };
    }
    res.json(success({ ...safeAgent, k8sLiveStatus: liveStatus }));
  } catch (err) {
    next(err);
  }
});

// ── PUT /agents/:id ───────────────────────────────────────────────────────────
// Updates the DB record. If metadata.telegramBotToken changed, also:
//   1. Upserts the K8s credentials Secret (so the pod env gets the new token).
//   2. Triggers a rolling Deployment restart (initContainer re-runs bootstrap.sh,
//      which reconfigures the Telegram channel with the new token).

agentsRouter.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateAgentSchema.parse(req.body);

    // ── Fetch current record to compare telegramBotToken ─────────────────────
    const [existing] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, String(req.params.id)));

    if (!existing) {
      res.status(404).json(failure("Agent not found"));
      return;
    }

    const [updated] = await db
      .update(agents)
      .set({
        ...input,
        // Merge metadata server-side to prevent partial-update data loss.
        // The frontend may send a subset of fields (e.g. only telegramBotToken),
        // which would otherwise silently wipe personality, avatarColor, etc.
        metadata: input.metadata
          ? { ...((existing.metadata as Record<string, unknown>) ?? {}), ...(input.metadata as Record<string, unknown>) }
          : existing.metadata,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, String(req.params.id)))
      .returning();

    if (!updated) {
      res.status(404).json(failure("Agent not found"));
      return;
    }

    // ── Sync K8s Secret + rollout restart if telegram token changed ───────────
    const oldToken = (existing.metadata as Record<string, unknown> | null)?.telegramBotToken;
    const newToken = (updated.metadata  as Record<string, unknown> | null)?.telegramBotToken;

    // Trigger K8s sync whenever the token changes — including removal (disconnect).
    if (newToken !== oldToken) {
      await db
        .update(agents)
        .set({
          metadata: {
            ...((updated.metadata as Record<string, unknown>) ?? {}),
            telegramStatus: "pending_pairing",
          },
          updatedAt: new Date(),
        })
        .where(eq(agents.id, updated.id));

      try {
        // Resolve the workspace namespace for this agent
        const [team] = await db.select().from(teams).where(eq(teams.id, updated.teamId));
        const [workspace] = team
          ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId))
          : [];

        if (workspace?.k8sNamespace) {
          // 1. Upsert credentials Secret with new token
          await applyCredentialsSecret(workspace.k8sNamespace, updated);
          // 2. Rolling restart so initContainer picks up TELEGRAM_BOT_TOKEN
          await rolloutRestartDeployment(workspace.k8sNamespace, updated.id);
          console.log(`[agents] Telegram token updated — rollout restart triggered for ${updated.id}`);
        }
      } catch (k8sErr) {
        // Non-fatal: DB is already updated, log for ops visibility
        console.error("[agents] K8s Secret/restart after telegram token change failed:", k8sErr);
      }
    }

    res.json(success(updated));
  } catch (err) {
    next(err);
  }
});

// ── POST /agents/:id/telegram/approve-pairing ───────────────────────────────────────
// Receives the one-shot pairing code from the user, executes
//   openclaw pairing approve telegram <code>
// inside the agent pod, then marks telegramStatus = 'complete' in the DB.

agentsRouter.post("/:id/telegram/approve-pairing", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code || typeof code !== "string" || !code.trim()) {
      res.status(400).json(failure("Pairing code is required"));
      return;
    }

    const [agent] = await db.select().from(agents).where(eq(agents.id, String(req.params.id)));
    if (!agent) {
      res.status(404).json(failure("Agent not found"));
      return;
    }

    const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId));
    const [workspace] = team
      ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId))
      : [];

    if (!workspace?.k8sNamespace) {
      res.status(400).json(failure("Agent not provisioned in cluster"));
      return;
    }

    // Execute the pairing approval inside the live pod
    const output = await execInAgentPod(
      workspace.k8sNamespace,
      agent.id,
      ["openclaw", "pairing", "approve", "telegram", code.trim()],
    );
    console.log(`[agents] Telegram pairing approved for ${agent.id}:`, output);

    // Mark integration as complete in DB
    const [updated] = await db
      .update(agents)
      .set({
        metadata: {
          ...((agent.metadata as Record<string, unknown>) ?? {}),
          telegramStatus: "complete",
        },
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id))
      .returning();

    res.json(success({ message: "Telegram pairing approved.", telegramStatus: "complete", agent: updated }));
  } catch (err) {
    next(err);
  }
});

// ── POST /agents/:id/command ──────────────────────────────────────────────────
// Publishes an ad-hoc command to an agent's queue via the tenant exchange.
// Body: { action: string; payload: Record<string, unknown>; sessionKey?: string }
//
// This is the machine-to-machine path (controller, other agents).
// For human chat from the Web UI, use POST /conversations/:id/messages instead.

agentsRouter.post("/:id/command", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, payload, sessionKey } = req.body as {
      action?: string;
      payload?: Record<string, unknown>;
      sessionKey?: string;
    };

    if (!action || typeof action !== "string") {
      res.status(400).json(failure("action is required"));
      return;
    }

    const [agent] = await db.select().from(agents).where(eq(agents.id, String(req.params.id)));
    if (!agent) {
      res.status(404).json(failure("Agent not found"));
      return;
    }

    const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId));
    const [workspace] = team
      ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId))
      : [];

    if (!workspace) {
      res.status(400).json(failure("Workspace not found"));
      return;
    }

    const messageId = randomBytes(16).toString("hex");
    const effectiveSessionKey = sessionKey ?? `cmd-${messageId}`;

    await publishToAgent(
      {
        host:     process.env.RABBITMQ_AMQP_HOST ?? "localhost",
        amqpPort: Number(process.env.RABBITMQ_AMQP_PORT ?? 5672),
        vhost:    tenantVhost(workspace.id),
        // Use admin credentials — the admin user has full access to all vhosts.
        // The tenant-user credentials are only for the consumer sidecar in the agent pod.
        username: process.env.RABBITMQ_ADMIN_USER ?? "admin",
        password: process.env.RABBITMQ_ADMIN_PASSWORD ?? "admin",
        exchange: tenantExchange(workspace.id),
      },
      {
        tenantId:   workspace.id,
        agentId:    agent.id,
        sessionKey: effectiveSessionKey,
        messageId,
        action,
        payload:    payload ?? {},
      },
    );

    res.json(success({ queued: true, messageId, agentId: agent.id, sessionKey: effectiveSessionKey }));
  } catch (err) {
    next(err);
  }
});

// ── DELETE /agents/:id ────────────────────────────────────────────────────────
// 1. Deletes the KivoAgent CR — K8s GC automatically removes Deployment, PVC, ConfigMap.
// 2. Deletes the credentials Secret.
// 3. If this was the last agent in the workspace, deprovisions the RabbitMQ tenant.
// 4. Removes the agent from postgres.

agentsRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, String(req.params.id)));

    if (!agent) {
      res.status(404).json(failure("Agent not found"));
      return;
    }

    // ── Resolve namespace ─────────────────────────────────────────────────────
    const [team]      = await db.select().from(teams).where(eq(teams.id, agent.teamId));
    const [workspace] = team
      ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId))
      : [];

    if (workspace?.k8sNamespace) {
      try {
        await deleteKivoAgentCR(workspace.k8sNamespace, agent.id);
        await deleteCredentialsSecret(workspace.k8sNamespace, agent.id);
      } catch (k8sErr) {
        console.error("[agents] K8s deprovision error (proceeding with DB delete):", k8sErr);
      }
    }

    await db.update(agents).set({ k8sStatus: "terminated" }).where(eq(agents.id, agent.id));
    await db.delete(agents).where(eq(agents.id, agent.id));

    // ── RabbitMQ deprovisioning (only if no more agents in workspace) ─────────
    if (workspace) {
      try {
        const [{ value: remaining }] = await db
          .select({ value: count() })
          .from(agents)
          .where(eq(agents.teamId, agent.teamId));

        if (remaining === 0) {
          await deprovisionTenant(workspace.id);
          console.log(`[agents] RabbitMQ tenant deprovisioned for workspace ${workspace.id}`);
        }
      } catch (rabbitErr) {
        console.error("[agents] RabbitMQ deprovision error (non-fatal):", rabbitErr);
      }
    }

    res.status(200).json(success({ deleted: true, id: agent.id }));
  } catch (err) {
    next(err);
  }
});
