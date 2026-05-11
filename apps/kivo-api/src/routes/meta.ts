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
    
    // Explicitly select columns to avoid 'column name does not exist' errors from stale build artifacts
    let query = db
      .select({
        id: teamTypes.id,
        nameI18nKey: teamTypes.nameI18nKey,
        descriptionI18nKey: teamTypes.descriptionI18nKey,
        emoji: teamTypes.emoji,
        color: teamTypes.color,
        featured: teamTypes.featured,
        mission: teamTypes.mission,
        waysOfWorking: teamTypes.waysOfWorking,
      })
      .from(teamTypes)
      .$dynamic();
    
    // DEBUG: Log the generated SQL to investigate 'column name does not exist' errors
    console.log("[DEBUG] /meta/team-types SQL:", query.toSQL());
    
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
        role: {
          id: agentRoles.id,
          nameI18nKey: agentRoles.nameI18nKey,
          descriptionI18nKey: agentRoles.descriptionI18nKey,
          suggestedNameI18nKey: agentRoles.suggestedNameI18nKey,
          emoji: agentRoles.emoji,
          emojiBgColor: agentRoles.emojiBgColor,
          soul: agentRoles.soul,
          identity: agentRoles.identity,
          operatingInstructions: agentRoles.operatingInstructions,
        },
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
    
    let query = db
      .select({
        id: agentRoles.id,
        nameI18nKey: agentRoles.nameI18nKey,
        descriptionI18nKey: agentRoles.descriptionI18nKey,
        suggestedNameI18nKey: agentRoles.suggestedNameI18nKey,
        emoji: agentRoles.emoji,
        emojiBgColor: agentRoles.emojiBgColor,
        soul: agentRoles.soul,
        identity: agentRoles.identity,
        operatingInstructions: agentRoles.operatingInstructions,
      })
      .from(agentRoles)
      .$dynamic();
    
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
