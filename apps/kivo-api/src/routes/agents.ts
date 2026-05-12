import { randomBytes } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, count } from "drizzle-orm";
import { db } from "../db/client";
import { agents, workspaces, teams, users } from "../db/schema";
import { createAgentSchema, updateAgentSchema } from "../schemas/agent.schema";
import { success, failure } from "../lib/response";
import { replacePlaceholders } from "../lib/messages";
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
} from "../k8s/provisioner";

export const agentsRouter = Router();

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

    const { agentRoles: agentRolesSchema } = await import("../db/schema");
    const [role] = await db.select().from(agentRolesSchema).where(eq(agentRolesSchema.id, input.type));

    const [user] = await db.select().from(users).where(eq(users.id, workspace.userId));

    const placeholderVars = {
      agent_name: input.name,
      team_name: team.name,
      team_id: input.teamId,
      operator_name: user?.name || "Operator",
      mission: team.mission || "",
    };

    const [agent] = await db
      .insert(agents)
      .values({
        teamId: input.teamId,
        name: input.name,
        roleId: input.type,
        icon: input.icon,
        gatewayToken,
        k8sStatus: "pending",
        soul: replacePlaceholders(role?.soul, placeholderVars),
        identity: replacePlaceholders(role?.identity, placeholderVars),
        agentsInstructions: replacePlaceholders(role?.operatingInstructions, placeholderVars),
        userContext: "",
        memory: "",
        toolsNotes: "",
        heartbeat: "",
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
        metadata: input.metadata
          ? { ...((existing.metadata as Record<string, unknown>) ?? {}), ...(input.metadata as Record<string, unknown>) }
          : existing.metadata,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, String(req.params.id)))
      .returning();

    const oldToken = (existing.metadata as Record<string, unknown> | null)?.telegramBotToken;
    const newToken = (updated.metadata  as Record<string, unknown> | null)?.telegramBotToken;

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
        const [team] = await db.select().from(teams).where(eq(teams.id, updated.teamId));
        const [workspace] = team
          ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId))
          : [];

        if (workspace?.k8sNamespace) {
          await applyCredentialsSecret(workspace.k8sNamespace, updated);
          await rolloutRestartDeployment(workspace.k8sNamespace, updated.id);
        }
      } catch (k8sErr) {
        console.error("[agents] K8s Secret/restart failed:", k8sErr);
      }
    }

    res.json(success(updated));
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
