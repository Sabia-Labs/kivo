import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { workspaces, teams, agents } from "../db/schema";
import { createTeamSchema, updateTeamSchema } from "../schemas/team.schema";
import { success, failure } from "../lib/response";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  applyCredentialsSecret,
  applyKivoAgentCR,
  ensureNamespace,
  workspaceNamespace,
  applyRabbitMQCredentialsSecret,
} from "../k8s/provisioner";
import { provisionTenant } from "../lib/rabbitmq";
import { requestsRouter } from "./requests";
import { activitiesRouter } from "./activities";
import { getTeamById } from "../controllers/teamsController";
import { getAgentsByTeam } from "../controllers/agentsController";

export const teamsRouter = Router();

// ── GET /teams/mine ──────────────────────────────────────────────────────────
// Returns all teams (with agents) for the authenticated user's workspace.

teamsRouter.get("/mine", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Find the user's workspace.
    const [workspace] = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.userId, req.actor!.id))
      .limit(1);

    if (!workspace) {
      res.json(success([]));
      return;
    }

    // 2. Get all teams for that workspace.
    const userTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.workspaceId, workspace.id))
      .orderBy(teams.createdAt);

    // 3. For each team, load its agents.
    const result = await Promise.all(
      userTeams.map(async (team) => {
        const teamAgents = await getAgentsByTeam(team.id);
        return { ...team, agents: teamAgents, workspace };
      })
    );

    res.json(success(result));
  } catch (err) {
    next(err);
  }
});

// ── POST /teams ───────────────────────────────────────────────────────────────
// Creates a team and automatically creates an associated team_lead agent.

teamsRouter.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createTeamSchema.parse(req.body);

    // Resolve workspaceId from the authenticated user when not explicitly provided.
    // NOTE: In the new architecture, we'll likely pass workspace context in the token
    // or as a header. For now, we enforce it being in the input or provide a better error.
    let workspaceId = input.workspaceId;
    if (!workspaceId) {
      res.status(400).json(failure("workspaceId is required in the new architecture."));
      return;
    }

    // Use a transaction so team + agents are created atomically.
    const result = await db.transaction(async (tx) => {
      const [team] = await tx
        .insert(teams)
        .values({
          workspaceId: workspaceId as string,
          name: input.name,
          identifierPrefix: input.identifierPrefix,
          mission: input.mission,
          waysOfWorking: input.waysOfWorking,
          template: input.template,
        })
        .returning();


      // Create agents provided by the caller, or fall back to a default team lead.
      // Fetch agent roles to copy profile fields
      const { agentRoles: agentRolesSchema } = await import("../db/schema");
      const allAgentRoles = await tx.select().from(agentRolesSchema);
      const rolesMap = new Map(allAgentRoles.map(r => [r.id, r]));

      const agentInputs =
        input.agents && input.agents.length > 0
          ? input.agents.map((a) => {
              const role = rolesMap.get(a.type);
              return {
                teamId: team.id,
                name: a.name,
                type: a.type,
                icon: a.icon,
                gatewayToken: randomBytes(32).toString("base64url"),
                soul: role?.soul,
                identity: role?.identity,
                agentsInstructions: role?.agentsInstructions,
                userContext: role?.userContext,
                memory: role?.memory,
                toolsNotes: role?.toolsNotes,
                heartbeat: role?.heartbeat,
              };
            })
          : (() => {
              const role = rolesMap.get("team_lead");
              return [{ 
                teamId: team.id, 
                name: "Team Lead", 
                type: "team_lead" as const, 
                gatewayToken: randomBytes(32).toString("base64url"),
                soul: role?.soul,
                identity: role?.identity,
                agentsInstructions: role?.agentsInstructions,
                userContext: role?.userContext,
                memory: role?.memory,
                toolsNotes: role?.toolsNotes,
                heartbeat: role?.heartbeat,
              }];
            })();

      const createdAgents = await tx.insert(agents).values(agentInputs).returning();

      // Seed Team Capabilities from Template
      const { teamMetaCapabilities, teamCapabilities } = await import("../db/schema");
      const templateCapabilities = await tx
        .select()
        .from(teamMetaCapabilities)
        .where(eq(teamMetaCapabilities.teamTypeId, input.template || "starter"));

      if (templateCapabilities.length > 0) {
        await tx.insert(teamCapabilities).values(
          templateCapabilities.map((cap) => ({
            teamId: team.id,
            name: cap.name,
            identifier: cap.identifier,
            instructions: cap.instructions,
            inputsDescription: cap.inputsDescription,
            expectedOutputsDescription: cap.expectedOutputsDescription,
            tasksWorkflow: cap.tasksWorkflow,
            type: cap.type,
          }))
        );
      }

      return { team, agents: createdAgents };
    });

    // ── K8s provisioning (best-effort — DB is source of truth) ───────────────
    const [workspace] = await db
      .select({ k8sNamespace: workspaces.k8sNamespace })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId!));

    const namespace = workspace?.k8sNamespace ?? workspaceNamespace(workspaceId!);

    try {
      // 1. Ensure the namespace exists in the cluster
      await ensureNamespace(namespace);

      // 2. Persist the namespace name in the DB if it was missing/derived
      if (!workspace?.k8sNamespace) {
        await db
          .update(workspaces)
          .set({ k8sNamespace: namespace })
          .where(eq(workspaces.id, workspaceId!));
      }

      // 3. Provision RabbitMQ tenant (vhost, user, exchange)
      try {
        const rabbitCreds = await provisionTenant(workspaceId!);
        await applyRabbitMQCredentialsSecret(namespace, rabbitCreds);
      } catch (rabbitErr) {
        console.error(`[teams] RabbitMQ provisioning failed for workspace ${workspaceId}:`, rabbitErr);
      }

      // 4. Provision Agents
      for (const agent of result.agents) {
        try {
          await applyCredentialsSecret(namespace, agent);
          await applyKivoAgentCR(namespace, agent, workspaceId!, result.team.name);
          await db
            .update(agents)
            .set({ k8sStatus: "provisioning", k8sResourceName: agent.id })
            .where(eq(agents.id, agent.id));
        } catch (err) {
          console.error(`[teams] Failed to provision agent ${agent.id}:`, err);
        }
      }
    } catch (err) {
      console.error(`[teams] K8s provisioning failed for team ${result.team.id} in namespace ${namespace}:`, err);
    }

    res.status(201).json(success(result));
  } catch (err) {
    next(err);
  }
});


// ── GET /teams ────────────────────────────────────────────────────────────────

teamsRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.select().from(teams).orderBy(teams.createdAt);
    res.json(success(rows));
  } catch (err) {
    next(err);
  }
});

// ── GET /teams/:id ────────────────────────────────────────────────────────────

teamsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = await getTeamById(String(req.params.id));

    if (!team) {
      res.status(404).json(failure("Team not found"));
      return;
    }

    res.json(success(team));
  } catch (err) {
    next(err);
  }
});

// ── PUT /teams/:id ────────────────────────────────────────────────────────────

teamsRouter.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateTeamSchema.parse(req.body);

    const [updated] = await db
      .update(teams)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(teams.id, String(req.params.id)))
      .returning();

    if (!updated) {
      res.status(404).json(failure("Team not found"));
      return;
    }

    res.json(success(updated));
  } catch (err) {
    next(err);
  }
});

// ── DELETE /teams/:id ─────────────────────────────────────────────────────────

teamsRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db
      .delete(teams)
      .where(eq(teams.id, String(req.params.id)))
      .returning();

    if (!deleted) {
      res.status(404).json(failure("Team not found"));
      return;
    }

    res.status(200).json(success({ deleted: true, id: deleted.id }));
  } catch (err) {
    next(err);
  }
});



// ── GET /teams/:id/capabilities ─────────────────────────────────────────────
teamsRouter.get("/:id/capabilities", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { getCapabilitiesByTeam } = await import("../controllers/capabilitiesController");
    const rows = await getCapabilitiesByTeam(String(req.params.id));
    res.json(success(rows));
  } catch (err) { next(err); }
});

teamsRouter.post("/:id/capabilities", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamCapabilities } = await import("../db/schema");
    
    const generateSlug = (str: string) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const name = String(req.body.name || "New Capability");
    const identifier = req.body.identifier ? String(req.body.identifier) : generateSlug(name);
    
    const type = req.body.type || "task_template";
    const tasksWorkflow = req.body.tasksWorkflow || null;
    let inputsDescription = req.body.inputsDescription ? String(req.body.inputsDescription) : null;
    
    if (type === "workflow" && Array.isArray(tasksWorkflow) && tasksWorkflow.length > 0) {
      const { and } = await import("drizzle-orm");
      const [firstTask] = await db.select().from(teamCapabilities).where(
        and(
          eq(teamCapabilities.teamId, String(req.params.id)),
          eq(teamCapabilities.identifier, tasksWorkflow[0])
        )
      );
      if (firstTask) {
        inputsDescription = firstTask.inputsDescription;
      }
    }

    const [created] = await db.insert(teamCapabilities).values({
      teamId: String(req.params.id),
      name,
      identifier,
      instructions: String(req.body.instructions || ""),
      inputsDescription,
      expectedOutputsDescription: req.body.expectedOutputsDescription ? String(req.body.expectedOutputsDescription) : null,
      assignedAgentId: req.body.assignedAgentId ? String(req.body.assignedAgentId) : null,
      assignedRole: req.body.assignedRole ? String(req.body.assignedRole) : null,
      isEnabled: Boolean(req.body.isEnabled ?? true),
      isFavorite: Boolean(req.body.isFavorite ?? false),
      scheduleConfig: req.body.scheduleConfig || null,
      tasksWorkflow,
      type
    }).returning();
    
    // Sync K8s CronJob
    const { workspaces, teams } = await import("../db/schema");
    const [team] = await db.select().from(teams).where(eq(teams.id, String(req.params.id)));
    const [workspace] = team ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId)) : [];
    if (workspace?.k8sNamespace) {
      const { upsertCapabilityCronJob } = await import("../k8s/cronjob");
      await upsertCapabilityCronJob(created, String(req.params.id), workspace.k8sNamespace);
    }
    
    res.status(201).json(success(created));
  } catch (err) { next(err); }
});

teamsRouter.put("/:id/capabilities/:capId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamCapabilities } = await import("../db/schema");
    const { and } = await import("drizzle-orm");
    
    // Fetch existing to check if identifier is changing
    const [existing] = await db.select().from(teamCapabilities)
      .where(and(eq(teamCapabilities.id, String(req.params.capId)), eq(teamCapabilities.teamId, String(req.params.id))));
      
    if (!existing) {
      return res.status(404).json(failure("Capability not found"));
    }
    
    const updateData: any = {};
    if (req.body.isEnabled !== undefined) updateData.isEnabled = Boolean(req.body.isEnabled);
    if (req.body.isFavorite !== undefined) updateData.isFavorite = Boolean(req.body.isFavorite);
    if (req.body.scheduleConfig !== undefined) updateData.scheduleConfig = req.body.scheduleConfig;
    if (req.body.name !== undefined) updateData.name = String(req.body.name);
    if (req.body.identifier !== undefined) updateData.identifier = String(req.body.identifier);
    if (req.body.instructions !== undefined) updateData.instructions = String(req.body.instructions);
    if (req.body.inputsDescription !== undefined) updateData.inputsDescription = req.body.inputsDescription ? String(req.body.inputsDescription) : null;
    if (req.body.expectedOutputsDescription !== undefined) updateData.expectedOutputsDescription = req.body.expectedOutputsDescription ? String(req.body.expectedOutputsDescription) : null;
    if (req.body.assignedAgentId !== undefined) updateData.assignedAgentId = req.body.assignedAgentId ? String(req.body.assignedAgentId) : null;
    if (req.body.assignedRole !== undefined) updateData.assignedRole = req.body.assignedRole ? String(req.body.assignedRole) : null;
    if (req.body.tasksWorkflow !== undefined) updateData.tasksWorkflow = req.body.tasksWorkflow;
    if (req.body.type !== undefined) updateData.type = req.body.type;
    
    const resolvedType = updateData.type || existing.type;
    const resolvedTasksWorkflow = updateData.tasksWorkflow !== undefined ? updateData.tasksWorkflow : existing.tasksWorkflow;
    
    if (resolvedType === "workflow" && Array.isArray(resolvedTasksWorkflow) && resolvedTasksWorkflow.length > 0) {
      const [firstTask] = await db.select().from(teamCapabilities).where(
        and(
          eq(teamCapabilities.teamId, String(req.params.id)),
          eq(teamCapabilities.identifier, resolvedTasksWorkflow[0])
        )
      );
      if (firstTask) {
        updateData.inputsDescription = firstTask.inputsDescription;
      }
    }
    
    const [updated] = await db.update(teamCapabilities)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(teamCapabilities.id, String(req.params.capId)), eq(teamCapabilities.teamId, String(req.params.id))))
      .returning();
      
    // Cascade update tasksWorkflow if identifier changed
    if (updated && existing.identifier !== updated.identifier) {
      const allCaps = await db.select().from(teamCapabilities).where(eq(teamCapabilities.teamId, String(req.params.id)));
      for (const cap of allCaps) {
        if (cap.id === updated.id) continue;
        const suggestions = cap.tasksWorkflow as string[] | null;
        if (suggestions && Array.isArray(suggestions) && suggestions.includes(existing.identifier)) {
          const newSuggestions = suggestions.map(id => id === existing.identifier ? updated.identifier : id);
          await db.update(teamCapabilities)
            .set({ tasksWorkflow: newSuggestions })
            .where(eq(teamCapabilities.id, cap.id));
        }
      }
    }
      
    // Sync K8s CronJob
    if (updated) {
      const { workspaces, teams } = await import("../db/schema");
      const [team] = await db.select().from(teams).where(eq(teams.id, String(req.params.id)));
      const [workspace] = team ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId)) : [];
      if (workspace?.k8sNamespace) {
        const { upsertCapabilityCronJob } = await import("../k8s/cronjob");
        await upsertCapabilityCronJob(updated, String(req.params.id), workspace.k8sNamespace);
      }
    }
      
    res.json(success(updated));
  } catch (err) { next(err); }
});
// ── GET /teams/:id/integrations ─────────────────────────────────────────────
teamsRouter.get("/:id/integrations", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { integrations } = await import("../db/schema");
    const rows = await db.select().from(integrations).where(eq(integrations.teamId, String(req.params.id)));
    res.json(success(rows));
  } catch (err) { next(err); }
});

teamsRouter.put("/:id/integrations/:provider", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { integrations, agents, workspaces, teams: teamsSchema } = await import("../db/schema");
    const { and } = await import("drizzle-orm");
    const { applyCredentialsSecret, rolloutRestartDeployment } = await import("../k8s/provisioner");
    const teamId = String(req.params.id);
    const provider = String(req.params.provider) as any;
    
    // UPSERT integration
    const existing = await db.query.integrations.findFirst({
      where: and(eq(integrations.teamId, teamId), eq(integrations.provider, provider))
    });
    
    let result;
    if (existing) {
      const [updated] = await db.update(integrations)
        .set({ apiKey: req.body.apiKey, metadata: req.body.metadata })
        .where(eq(integrations.id, existing.id))
        .returning();
      result = updated;
    } else {
      const [created] = await db.insert(integrations).values({
        teamId,
        provider,
        apiKey: req.body.apiKey,
        metadata: req.body.metadata
      }).returning();
      result = created;
    }
    
    // ── Sync to agents & Restart K8s Pods ──
    const teamAgents = await getAgentsByTeam(teamId);
    const [team] = await db.select().from(teamsSchema).where(eq(teamsSchema.id, teamId));
    const [workspace] = team ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId)) : [];
    
    if (workspace && workspace.k8sNamespace) {
      for (const agent of teamAgents) {
        const metadata = (agent.metadata ?? {}) as Record<string, unknown>;
        
        if (provider === "linear") {
          metadata.linearApiKey = req.body.apiKey;
          metadata.linearEnabled = true;
        } else if (provider === "github") {
          metadata.githubToken = req.body.apiKey;
          metadata.githubEnabled = true;
          metadata.githubAuthMode = "token";
        }
        
        // Save back to db
        const [updatedAgent] = await db.update(agents)
          .set({ metadata, updatedAt: new Date() })
          .where(eq(agents.id, agent.id))
          .returning();
          
        // K8s Sync
        if (updatedAgent) {
          try {
            await applyCredentialsSecret(workspace.k8sNamespace, updatedAgent);
            await rolloutRestartDeployment(workspace.k8sNamespace, updatedAgent.id);
            console.log(`[teams] Agent ${agent.id} synchronized with ${provider} and restarted`);
          } catch (k8sErr) {
            console.error(`[teams] Failed to sync K8s for agent ${agent.id}:`, k8sErr);
          }
        }
      }
    }

    res.json(success(result));
  } catch (err) { next(err); }
});

// ── Team Activities & Requests ──────────────────────────────────────────────────

teamsRouter.use("/:teamId/requests", requestsRouter);
teamsRouter.use("/:teamId/activities", activitiesRouter);

// ── Team Leader Chat ──────────────────────────────────────────────────────────

teamsRouter.get("/:id/leader-chat", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { leaderChatHistory } = await import("../db/schema");
    const { desc, and } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(leaderChatHistory)
      .where(and(eq(leaderChatHistory.teamId, String(req.params.id)), eq(leaderChatHistory.userId, req.actor!.id)))
      .orderBy(desc(leaderChatHistory.createdAt))
      .limit(50);
    
    res.json(success(rows.reverse()));
  } catch (err) { next(err); }
});

teamsRouter.post("/:id/leader-chat", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body;
    if (!message) {
      res.status(400).json(failure("Message is required"));
      return;
    }
    
    const teamId = String(req.params.id);
    const userId = req.actor!.id;
    
    // Save user message
    const { leaderChatHistory } = await import("../db/schema");
    await db.insert(leaderChatHistory).values({
      teamId,
      userId,
      message,
      role: "user"
    });
    
    // Run Langgraph
    const { runTeamLeaderChat } = await import("../workflows/teamLeaderChat");
    const aiResponse = await runTeamLeaderChat(teamId, userId, message);
    
    // Save AI response
    const [saved] = await db.insert(leaderChatHistory).values({
      teamId,
      userId,
      message: aiResponse,
      role: "assistant"
    }).returning();
    
    res.json(success(saved));
  } catch (err) { next(err); }
});
