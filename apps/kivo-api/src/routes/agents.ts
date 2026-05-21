import { randomBytes } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, count, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { agents, workspaces, teams, users } from "../db/schema";
import { createAgentSchema, updateAgentSchema } from "../schemas/agent.schema";
import { success, failure } from "../lib/response";
import { replacePlaceholders } from "../lib/messages";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  workspaceNamespace,
  ensureNamespace,
  applyCredentialsSecret,
  applyKivoAgentCR,
  deleteKivoAgentCR,
  deleteCredentialsSecret,
  rolloutRestartDeployment,
  execInAgentPod,
  getKivoAgentStatus,
  deliverMessageToAgent,
  getAgentPodIP,
} from "../k8s/provisioner";

export const agentsRouter = Router();

// Apply authMiddleware globally to secure all endpoints under /agents
agentsRouter.use(authMiddleware);

// ── POST /agents ──────────────────────────────────────────────────────────────
agentsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createAgentSchema.parse(req.body);

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

    const namespace = workspace.k8sNamespace ?? workspaceNamespace(workspace.id);

    if (!workspace.k8sNamespace) {
      await db
        .update(workspaces)
        .set({ k8sNamespace: namespace })
        .where(eq(workspaces.id, workspace.id));
    }

    const gatewayToken = randomBytes(32).toString("base64url");

    const [agent] = await db
      .insert(agents)
      .values({
        teamId: input.teamId,
        name: input.name,
        roleId: input.roleId,
        icon: input.icon,
        gatewayToken,
        metadata: input.metadata || {},
        k8sStatus: "pending",
      })
      .returning();

    try {
      await ensureNamespace(namespace);
      await applyCredentialsSecret(namespace, agent);
      await applyKivoAgentCR(namespace, agent, workspace.id, team.name);

      await db
        .update(agents)
        .set({ k8sStatus: "provisioning", k8sResourceName: agent.id })
        .where(eq(agents.id, agent.id));

      agent.k8sStatus      = "provisioning";
      agent.k8sResourceName = agent.id;
    } catch (k8sErr) {
      console.error("[agents] K8s provisioning failed:", k8sErr);
      await db.update(agents).set({ k8sStatus: "failed" }).where(eq(agents.id, agent.id));
      agent.k8sStatus = "failed";
    }

    res.status(201).json(success(agent));
  } catch (err) {
    next(err);
  }
});

// ── GET /agents ───────────────────────────────────────────────────────────────
agentsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    
    // Support both human actors (scope by workspace) and agent actors (scope by team)
    let userTeamIds: string[] = [];
    
    if (actor.type === "human") {
      const [workspace] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.userId, actor.id))
        .limit(1);

      if (!workspace) {
        res.json(success([]));
        return;
      }

      const userTeams = await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.workspaceId, workspace.id));

      userTeamIds = userTeams.map((t) => t.id);
    } else if (actor.type === "agent") {
      if (actor.teamId) {
        userTeamIds = [actor.teamId];
      }
    }

    if (userTeamIds.length === 0) {
      res.json(success([]));
      return;
    }

    const { teamId } = req.query;
    if (teamId) {
      const targetTeamId = String(teamId);
      // Validate that the human/agent has access to the requested teamId
      if (!userTeamIds.includes(targetTeamId)) {
        res.status(403).json(failure("Access denied to this team's agents"));
        return;
      }
      const rows = await db
        .select()
        .from(agents)
        .where(eq(agents.teamId, targetTeamId))
        .orderBy(agents.createdAt);
      res.json(success(rows));
      return;
    }

    // Return all agents belonging to the workspace's teams
    const rows = await db
      .select()
      .from(agents)
      .where(inArray(agents.teamId, userTeamIds))
      .orderBy(agents.createdAt);

    res.json(success(rows));
  } catch (err) {
    next(err);
  }
});

// ── GET /agents/:id ───────────────────────────────────────────────────────────
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
      } catch { }
    }

    const { gatewayToken: _gt, ...safeAgent } = agent as any;
    
    // Sanitize metadata to hide token and add status flags for UI
    if (safeAgent.metadata) {
      const { telegramBotToken: _tok, ...safeMeta } = safeAgent.metadata;
      safeAgent.metadata = { ...safeMeta, hasTelegramToken: Boolean(_tok) };
    }

    res.json(success({ ...safeAgent, k8sLiveStatus: liveStatus }));
  } catch (err) {
    next(err);
  }
});

// ── GET /agents/:id/files/:filename ───────────────────────────────────────────
/**
 * Busca um arquivo do workspace do agente diretamente do disco dele (via sidecar).
 * Permite que a UI mostre a identidade real e evoluída do agente.
 */
agentsRouter.get("/:id/files/:filename", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, filename } = req.params;
    const agentId = String(id);

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (!agent) return res.status(404).json(failure("Agent not found"));

    const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId)).limit(1);
    const workspaceId = team?.workspaceId;
    if (!workspaceId) return res.status(404).json(failure("Workspace not found"));

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) return res.status(404).json(failure("Workspace not found"));

    const namespace = workspace.k8sNamespace || workspaceNamespace(workspace.id);
    const podIP = await getAgentPodIP(namespace, agent.id);
    
    if (!podIP) {
      return res.status(503).json(failure("Agent pod not reachable or not running"));
    }

    const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;
    const url = `http://${podIP}:43124/v1/files/${filename}`;

    const sidecarRes = await fetch(url, {
      headers: {
        "x-internal-token": INTERNAL_TOKEN || "",
      },
    });

    if (!sidecarRes.ok) {
      const errorData = await sidecarRes.json().catch(() => ({ error: "sidecar_error" })) as any;
      return res.status(sidecarRes.status).json(failure(errorData.error || "Failed to fetch file from agent"));
    }

    const data = await sidecarRes.json();
    res.json(success(data));
  } catch (err) {
    next(err);
  }
});

// ── PUT /agents/:id ───────────────────────────────────────────────────────────
agentsRouter.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateAgentSchema.parse(req.body);
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
        updatedAt: new Date(),
      })
      .where(eq(agents.id, String(req.params.id)))
      .returning();

    // If metadata was updated, we need to refresh the credentials secret
    // and potentially restart the pod.
    if (input.metadata) {
      try {
        const [team] = await db.select().from(teams).where(eq(teams.id, updated.teamId));
        const [workspace] = team ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId)) : [];
        const namespace = workspace?.k8sNamespace || workspaceNamespace(workspace?.id || "");
        
        if (namespace) {
          // 1. Upsert credentials Secret with new values from DB and Env fallbacks
          await applyCredentialsSecret(namespace, updated);
          
          // 2. Rolling restart so agent picks up changes
          await rolloutRestartDeployment(namespace, updated.id);
          console.log(`[agents] Metadata updated — rollout restart triggered for ${updated.id} in ${namespace}`);
        }
      } catch (k8sErr) {
        console.error("[agents] K8s Secret/restart after metadata change failed:", k8sErr);
      }
    }

    res.json(success(updated));
  } catch (err) {
    next(err);
  }
});

// ── POST /agents/:id/telegram/approve-pairing ───────────────────────────────
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
    const [workspace] = team ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId)) : [];

    if (!workspace?.k8sNamespace) {
      res.status(400).json(failure("Agent not provisioned in cluster"));
      return;
    }

    // Execute the pairing approval inside the live pod
    try {
      const output = await execInAgentPod(workspace.k8sNamespace, agent.id, [
        "openclaw",
        "pairing",
        "approve",
        "telegram",
        code.trim()
      ]);
      console.log(`[agents] Telegram pairing approved for ${agent.id}:`, output);

      // Mark integration as complete in DB
      const [updated] = await db
        .update(agents)
        .set({
          metadata: {
            ...((agent.metadata as Record<string, unknown>) ?? {}),
            telegramStatus: "complete"
          },
          updatedAt: new Date()
        })
        .where(eq(agents.id, agent.id))
        .returning();

      res.json(success({ 
        message: "Telegram pairing approved.", 
        telegramStatus: "complete", 
        agent: updated 
      }));
    } catch (err: any) {
      console.error("[agents] Telegram pairing approval failed:", err);
      res.status(500).json(failure(err.message || "Failed to approve pairing. Is the agent pod running?"));
    }
  } catch (err) {
    next(err);
  }
});

// ── POST /agents/:id/command ──────────────────────────────────────────────────
agentsRouter.post("/:id/command", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, payload, sessionKey } = req.body as {
      action?: string;
      payload?: Record<string, unknown>;
      sessionKey?: string;
    };

    if (!action) return res.status(400).json(failure("action is required"));

    const [agent] = await db.select().from(agents).where(eq(agents.id, String(req.params.id)));
    if (!agent) return res.status(404).json(failure("Agent not found"));

    const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId));
    const [workspace] = team ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId)) : [];

    if (!workspace || !workspace.k8sNamespace) {
      return res.status(400).json(failure("Workspace or namespace not found"));
    }

    const messageId = randomBytes(16).toString("hex");
    const effectiveSessionKey = sessionKey ?? `cmd-${messageId}`;

    const delivered = await deliverMessageToAgent(workspace.k8sNamespace, agent.id, {
      sessionKey: effectiveSessionKey,
      content: JSON.stringify(payload ?? {}),
      messageId,
    });

    res.json(success({ delivered, messageId, agentId: agent.id, sessionKey: effectiveSessionKey }));
  } catch (err) {
    next(err);
  }
});

// ── DELETE /agents/:id ────────────────────────────────────────────────────────
agentsRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [agent] = await db.select().from(agents).where(eq(agents.id, String(req.params.id)));
    if (!agent) return res.status(404).json(failure("Agent not found"));

    const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId));
    const [workspace] = team ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId)) : [];

    if (workspace?.k8sNamespace) {
      try {
        await deleteKivoAgentCR(workspace.k8sNamespace, agent.id);
        await deleteCredentialsSecret(workspace.k8sNamespace, agent.id);
      } catch (k8sErr) {
        console.error("[agents] K8s deprovision error:", k8sErr);
      }
    }

    await db.delete(agents).where(eq(agents.id, agent.id));
    res.status(200).json(success({ deleted: true, id: agent.id }));
  } catch (err) {
    next(err);
  }
});
