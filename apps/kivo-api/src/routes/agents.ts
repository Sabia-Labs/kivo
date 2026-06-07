import { randomBytes } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { agents, workspaces, teams, users } from "../db/schema";
import { createAgentSchema, updateAgentSchema } from "../schemas/agent.schema";
import { success, failure } from "../lib/response";
import { authMiddleware } from "../middleware/authMiddleware";

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
      })
      .returning();

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

    const { gatewayToken: _gt, ...safeAgent } = agent as any;
    
    // Sanitize metadata to hide token and add status flags for UI
    if (safeAgent.metadata) {
      const { telegramBotToken: _tok, ...safeMeta } = safeAgent.metadata;
      safeAgent.metadata = { ...safeMeta, hasTelegramToken: Boolean(_tok) };
    }

    res.json(success(safeAgent));
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

    res.json(success(updated));
  } catch (err) {
    next(err);
  }
});

// ── DELETE /agents/:id ────────────────────────────────────────────────────────
agentsRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [agent] = await db.select().from(agents).where(eq(agents.id, String(req.params.id)));
    if (!agent) return res.status(404).json(failure("Agent not found"));

    await db.delete(agents).where(eq(agents.id, agent.id));
    res.status(200).json(success({ deleted: true, id: agent.id }));
  } catch (err) {
    next(err);
  }
});
