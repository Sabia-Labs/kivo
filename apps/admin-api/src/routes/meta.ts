import { Router } from "express";
import { db } from "../db/client";
import { teamTypes, agentRoles } from "../db/schema";
import { success, failure } from "../lib/response";

export const metaRouter = Router();

// ── GET /meta/team-types ──────────────────────────────────────────────────────
metaRouter.get("/team-types", async (req, res, next) => {
  try {
    const data = await db.select().from(teamTypes);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
});

// ── GET /meta/agent-roles ─────────────────────────────────────────────────────
metaRouter.get("/agent-roles", async (req, res, next) => {
  try {
    const data = await db.select().from(agentRoles);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
});
