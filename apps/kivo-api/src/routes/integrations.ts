import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { integrations, workspaces, teams } from "../db/schema";
import { createIntegrationSchema } from "../schemas/integration.schema";
import { authMiddleware } from "../middleware/authMiddleware";
import { success, failure } from "../lib/response";

export const integrationsRouter = Router({ mergeParams: true });

// ── POST /teams/:id/integrations ──────────────────────────────────────────────

integrationsRouter.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teamId = String(req.params.id);

    // Verify team exists.
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) {
      res.status(404).json(failure("Team not found"));
      return;
    }

    const input = createIntegrationSchema.parse(req.body);

    const [integration] = await db
      .insert(integrations)
      .values({ teamId, ...input })
      .returning();

    res.status(201).json(success(integration));
  } catch (err) {
    next(err);
  }
});

// ── GET /teams/:id/integrations ───────────────────────────────────────────────

integrationsRouter.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teamId = String(req.params.id);
    const rows = await db.select().from(integrations).where(eq(integrations.teamId, teamId));
    res.json(success(rows));
  } catch (err) {
    next(err);
  }
});
