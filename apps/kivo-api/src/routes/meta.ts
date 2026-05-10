import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, ilike, or } from "drizzle-orm";
import { db } from "../db/client";
import { teamTypes, agentRoles, teamTypeRoles } from "../db/schema";
import { success } from "../lib/response";

export const metaRouter = Router();

// ── GET /meta/team-types ────────────────────────────────────────────────────────
metaRouter.get("/team-types", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search } = req.query;
    
    let query = db.select().from(teamTypes).$dynamic();
    
    if (search && typeof search === 'string') {
      // Search in ID or i18n key since actual name is client-side
      query = query.where(or(
        ilike(teamTypes.id, `%${search}%`),
        ilike(teamTypes.nameI18nKey, `%${search}%`)
      ));
    }
    
    const types = await query;
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
        quantity: teamTypeRoles.quantity,
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
      query = query.where(or(
        ilike(agentRoles.id, `%${search}%`),
        ilike(agentRoles.nameI18nKey, `%${search}%`)
      ));
    }
    
    const roles = await query;
    res.json(success(roles));
  } catch (err) {
    next(err);
  }
});
