import { randomBytes } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { agents, workspaces, teams, users } from "../db/schema";
import { createAgentSchema } from "../schemas/agent.schema";
import { success, failure } from "../lib/response";
import { authMiddleware } from "../middleware/authMiddleware";
import { replacePlaceholders } from "../lib/messages";
import {
  applyCredentialsSecret,
  applyKivoAgentCR,
  ensureNamespace,
  workspaceNamespace,
} from "../k8s/provisioner";
import { getTeamById } from "../controllers/teamsController";
import { getAgentsByTeam } from "../controllers/agentsController";

export const teamManagementRouter = Router();

// Use unified auth
teamManagementRouter.use(authMiddleware);

/**
 * GET / (when mounted at /team)
 * Returns metadata for the authenticated agent's team OR the requested team for humans.
 */
teamManagementRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    let teamId = String(req.query.teamId || "");

    if (actor.type === "agent") {
      teamId = actor.teamId!;
    }

    if (!teamId) {
      res.status(400).json(failure("teamId is required for humans"));
      return;
    }

    const team = await getTeamById(teamId);

    if (!team) {
      res.status(404).json(failure("Team not found"));
      return;
    }

    // Security check for humans
    if (actor.type === "human") {
      const [ws] = await db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.id, team.workspaceId), eq(workspaces.userId, actor.id)));
      
      if (!ws) {
        res.status(403).json(failure("Access denied to this team"));
        return;
      }
    }

    res.json(success(team));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /members
 */
teamManagementRouter.get("/members", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    let teamId = String(req.query.teamId || "");
    if (actor.type === "agent") teamId = actor.teamId!;

    if (!teamId) {
      res.status(400).json(failure("teamId is required for humans"));
      return;
    }

    const rows = await getAgentsByTeam(teamId);

    const sanitized = rows.map((a: any) => {
      const { gatewayToken: _gt, ...safeAgent } = a;
      if (safeAgent.metadata) {
        const { telegramBotToken: _tok, ...safeMeta } = safeAgent.metadata;
        safeAgent.metadata = { ...safeMeta, hasTelegramToken: Boolean(_tok) };
      }
      return safeAgent;
    });

    res.json(success(sanitized));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /members
 */
teamManagementRouter.post("/members", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const teamId = actor.type === "agent" ? actor.teamId! : req.body.teamId;

    if (!teamId) {
      res.status(400).json(failure("teamId is required"));
      return;
    }

    const input = createAgentSchema.parse({ ...req.body, teamId });

    const team = await getTeamById(teamId);
    if (!team) {
      res.status(404).json(failure("Team not found"));
      return;
    }

    // Security check for humans
    if (actor.type === "human") {
      const [ws] = await db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.id, team.workspaceId), eq(workspaces.userId, actor.id)));
      
      if (!ws) {
        res.status(403).json(failure("Access denied to this team"));
        return;
      }
    }

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, team.workspaceId));
    
    if (!workspace) {
      res.status(404).json(failure("Workspace not found"));
      return;
    }

    const namespace = workspace.k8sNamespace ?? workspaceNamespace(workspace.id);
    const gatewayToken = randomBytes(32).toString("base64url");

    const [newAgent] = await db
      .insert(agents)
      .values({
        teamId,
        name: input.name,
        roleId: input.roleId, // input.roleId holds the role ID from client
        icon: input.icon,
        gatewayToken,
        metadata: input.metadata || {},
        k8sStatus: "pending",
      })
      .returning();


    try {
      await ensureNamespace(namespace);
      await applyCredentialsSecret(namespace, newAgent);
      await applyKivoAgentCR(namespace, newAgent, workspace.id, team.name);

      await db
        .update(agents)
        .set({ k8sStatus: "provisioning", k8sResourceName: newAgent.id })
        .where(eq(agents.id, newAgent.id));

      newAgent.k8sStatus = "provisioning";
      newAgent.k8sResourceName = newAgent.id;
    } catch (k8sErr) {
      console.error("[team-management] K8s provisioning failed:", k8sErr);
      await db.update(agents).set({ k8sStatus: "failed" }).where(eq(agents.id, newAgent.id));
      newAgent.k8sStatus = "failed";
    }

    const { gatewayToken: _gt, ...safeAgent } = newAgent as any;
    res.status(201).json(success(safeAgent));
  } catch (err) {
    next(err);
  }
});

// Import helpers for join logic
import { and } from "drizzle-orm";
