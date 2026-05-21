import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { workspaces, teams, agents, agentRoles, teamTypes, teamCapabilities, users } from "../db/schema";
import { createTeamSchema, updateTeamSchema } from "../schemas/team.schema";
import { success, failure } from "../lib/response";
import { authMiddleware } from "../middleware/authMiddleware";
import { replacePlaceholders } from "../lib/messages";
import {
  applyCredentialsSecret,
  applyKivoAgentCR,
  ensureNamespace,
  workspaceNamespace,
  deleteKivoAgentCR,
  deleteCredentialsSecret,
} from "../k8s/provisioner";
import { requestsRouter } from "./requests";
import { activitiesRouter } from "./activities";
import { getTeamById } from "../controllers/teamsController";
import { getAgentsByTeam } from "../controllers/agentsController";

export const teamsRouter = Router();

const ADMIN_API_URL = process.env.ADMIN_API_INTERNAL_URL || "http://kivo-admin-api:4001";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

// ── GET /teams/mine ──────────────────────────────────────────────────────────
teamsRouter.get("/mine", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [workspace] = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.userId, req.actor!.id))
      .limit(1);

    if (!workspace) {
      res.json(success([]));
      return;
    }

    const userTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.workspaceId, workspace.id))
      .orderBy(teams.createdAt);

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
teamsRouter.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createTeamSchema.parse(req.body);

    let workspaceId = input.workspaceId;
    if (!workspaceId) {
      res.status(400).json(failure("workspaceId is required."));
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.actor!.id));
    const operatorName = user?.name || "Operator";

    const result = await db.transaction(async (tx) => {
      // 0. Fetch template defaults if applicable
      let defaultMission = input.mission;
      let defaultWays = input.waysOfWorking;
      let defaultIcon = input.icon;

      if (input.templateId) {
        const [template] = await tx.select().from(teamTypes).where(eq(teamTypes.id, input.templateId));
        if (template) {
          if (!defaultMission) defaultMission = template.mission;
          if (!defaultWays) defaultWays = template.waysOfWorking;
          if (!defaultIcon) defaultIcon = template.emoji;
        }
      }

      // 1. Create Team
      const [team] = await tx
        .insert(teams)
        .values({
          workspaceId: workspaceId as string,
          name: input.name,
          identifierPrefix: input.identifierPrefix,
          mission: defaultMission,
          waysOfWorking: defaultWays,
          templateId: input.templateId,
          icon: defaultIcon,
        })
        .returning();

      // 2. Fetch rich data for Agents
      const allRoles = await tx.select().from(agentRoles);
      const rolesMap = new Map(allRoles.map(r => [r.id, r]));

      const agentInputs =
        input.agents && input.agents.length > 0
          ? input.agents.map((a) => {
              const role = rolesMap.get(a.roleId);
              const placeholderVars = {
                agent_name: a.name,
                team_name: team.name,
                team_id: team.id,
                operator_name: operatorName,
                mission: team.mission || "",
              };
              return {
                teamId: team.id,
                name: a.name,
                roleId: a.roleId,
                isLeader: a.isLeader || false,
                icon: a.icon || role?.emoji,
                gatewayToken: randomBytes(32).toString("base64url"),
              };
            })
          : [];

      if (agentInputs.length > 0) {
        await tx.insert(agents).values(agentInputs).returning();
      }

      // 3. Seed Capabilities (On-demand from Admin API)
      if (input.templateId && INTERNAL_TOKEN) {
        try {
          const capRes = await fetch(`${ADMIN_API_URL}/internal/v1/templates/capabilities/sync?teamTypeId=${input.templateId}`, {
            headers: { "x-internal-token": INTERNAL_TOKEN }
          });
          
          if (capRes.ok) {
            const capData = await capRes.json() as { data: any[] };
            const templateCaps = capData.data;
            if (templateCaps.length > 0) {
              await tx.insert(teamCapabilities).values(
                templateCaps.map((tc: any) => ({
                  teamId: team.id,
                  name: tc.capability.name,
                  identifier: tc.capability.id,
                  instructions: tc.capability.instructions,
                  inputsDescription: tc.capability.inputsDescription,
                  expectedOutputsDescription: tc.capability.expectedOutputsDescription,
                  tasksWorkflow: tc.capability.tasksWorkflow,
                  type: tc.capability.type,
                  isFavorite: tc.isFavorite,
                  assignedRole: tc.defaultAssignedRole,
                }))
              );
            }
          }
        } catch (capErr) {
          console.error(`[teams] Failed to fetch capabilities from Admin API:`, capErr);
        }
      }

      const createdAgents = await tx.select().from(agents).where(eq(agents.teamId, team.id));
      return { team, agents: createdAgents };
    });

    // ── K8s provisioning ─────────────────────────────────────────────────────
    const [workspace] = await db
      .select({ k8sNamespace: workspaces.k8sNamespace })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId!));

    const namespace = workspace?.k8sNamespace ?? workspaceNamespace(workspaceId!);

    try {
      await ensureNamespace(namespace);
      if (!workspace?.k8sNamespace) {
        await db.update(workspaces).set({ k8sNamespace: namespace }).where(eq(workspaces.id, workspaceId!));
      }

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
      console.error(`[teams] K8s provisioning failed for team ${result.team.id}:`, err);
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
    if (!team) return res.status(404).json(failure("Team not found"));
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

    if (!updated) return res.status(404).json(failure("Team not found"));
    res.json(success(updated));
  } catch (err) {
    next(err);
  }
});

// ── DELETE /teams/:id ─────────────────────────────────────────────────────────
teamsRouter.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teamId = String(req.params.id);

    // 1. Fetch team to identify its workspace
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId));

    if (!team) return res.status(404).json(failure("Team not found"));

    // 2. Fetch workspace to obtain the correct namespace
    const [workspace] = await db
      .select({ k8sNamespace: workspaces.k8sNamespace })
      .from(workspaces)
      .where(eq(workspaces.id, team.workspaceId));

    const namespace = workspace?.k8sNamespace ?? workspaceNamespace(team.workspaceId);

    // 3. Fetch all agents belonging to this team
    const teamAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.teamId, teamId));

    // 4. De-provision each agent in Kubernetes (CR and credentials secret)
    for (const agent of teamAgents) {
      try {
        await deleteKivoAgentCR(namespace, agent.id);
        await deleteCredentialsSecret(namespace, agent.id);
      } catch (k8sErr) {
        console.error(`[teams] Failed to delete K8s resources for agent ${agent.id}:`, k8sErr);
      }
    }

    // 5. Delete the team from PostgreSQL (cascades database tables)
    const [deleted] = await db
      .delete(teams)
      .where(eq(teams.id, teamId))
      .returning();

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
    
    res.status(201).json(success(created));
  } catch (err) { next(err); }
});

teamsRouter.put("/:id/capabilities/:capId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { and } = await import("drizzle-orm");
    const [existing] = await db.select().from(teamCapabilities)
      .where(and(eq(teamCapabilities.id, String(req.params.capId)), eq(teamCapabilities.teamId, String(req.params.id))));
      
    if (!existing) return res.status(404).json(failure("Capability not found"));
    
    const updateData: any = {};
    if (req.body.isEnabled !== undefined) updateData.isEnabled = Boolean(req.body.isEnabled);
    if (req.body.isFavorite !== undefined) updateData.isFavorite = Boolean(req.body.isFavorite);
    if (req.body.name !== undefined) updateData.name = String(req.body.name);
    if (req.body.instructions !== undefined) updateData.instructions = String(req.body.instructions);
    
    const [updated] = await db.update(teamCapabilities)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(teamCapabilities.id, String(req.params.capId)), eq(teamCapabilities.teamId, String(req.params.id))))
      .returning();
      
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
    const { integrations, agents: agentsTable, workspaces: wsTable, teams: teamsTable } = await import("../db/schema");
    const { and } = await import("drizzle-orm");
    const { applyCredentialsSecret, rolloutRestartDeployment } = await import("../k8s/provisioner");
    const teamId = String(req.params.id);
    const provider = String(req.params.provider) as any;
    
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
    
    const teamAgents = await getAgentsByTeam(teamId);
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
    const [workspace] = team ? await db.select().from(wsTable).where(eq(wsTable.id, team.workspaceId)) : [];
    
    if (workspace && workspace.k8sNamespace) {
      for (const agent of teamAgents) {
        const metadata = (agent.metadata ?? {}) as Record<string, unknown>;
        if (provider === "linear") metadata.linearApiKey = req.body.apiKey;
        else if (provider === "github") metadata.githubToken = req.body.apiKey;
        
        await db.update(agentsTable).set({ metadata, updatedAt: new Date() }).where(eq(agentsTable.id, agent.id));
        try {
          await applyCredentialsSecret(workspace.k8sNamespace, agent);
          await rolloutRestartDeployment(workspace.k8sNamespace, agent.id);
        } catch {}
      }
    }
    res.json(success(result));
  } catch (err) { next(err); }
});

teamsRouter.use("/:teamId/requests", requestsRouter);
teamsRouter.use("/:teamId/activities", activitiesRouter);
