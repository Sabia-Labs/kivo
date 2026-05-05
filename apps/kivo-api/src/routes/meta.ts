import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, ilike } from "drizzle-orm";
import { db } from "../db/client";
import { teamTypes, agentRoles, teamTypeRoles } from "../db/schema";
import { success, failure } from "../lib/response";

export const metaRouter = Router();

// ── GET /meta/team-types ────────────────────────────────────────────────────────
metaRouter.get("/team-types", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search } = req.query;
    
    let query = db.select().from(teamTypes).$dynamic();
    
    if (search && typeof search === 'string') {
      // Very basic search, depending on the DB dialect ilike or like
      query = query.where(ilike(teamTypes.name, `%${search}%`));
    }
    
    const types = await query.orderBy(teamTypes.createdAt);
    res.json(success(types));
  } catch (err) {
    next(err);
  }
});

// ── GET /meta/team-types/:id/roles ──────────────────────────────────────────────
metaRouter.get("/team-types/:id/roles", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teamTypeId = String(req.params.id);

    const rolesWithLeader = await db
      .select({
        role: agentRoles,
        isLeader: teamTypeRoles.isLeader,
      })
      .from(teamTypeRoles)
      .innerJoin(agentRoles, eq(teamTypeRoles.agentRoleId, agentRoles.id))
      .where(eq(teamTypeRoles.teamTypeId, teamTypeId));

    res.json(success(rolesWithLeader));
  } catch (err) {
    next(err);
  }
});

// ── GET /meta/agent-roles ───────────────────────────────────────────────────────
metaRouter.get("/agent-roles", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search } = req.query;
    let query = db.select().from(agentRoles).$dynamic();
    
    if (search && typeof search === 'string') {
      query = query.where(ilike(agentRoles.name, `%${search}%`));
    }
    
    const roles = await query.orderBy(agentRoles.createdAt);
    res.json(success(roles));
  } catch (err) {
    next(err);
  }
});
