import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { integrations, workspaces, teams, agents } from "../db/schema";
import { createIntegrationSchema } from "../schemas/integration.schema";
import { authMiddleware } from "../middleware/authMiddleware";
import { success, failure } from "../lib/response";

export const integrationsRouter = Router({ mergeParams: true });


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

// ── PUT /teams/:id/integrations/:role ─────────────────────────────────────

integrationsRouter.put("/:role", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teamId = String(req.params.id);
    const role = String(req.params.role);
    const provider = req.body.provider;

    // Verify team exists.
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) {
      res.status(404).json(failure("Team not found"));
      return;
    }

    // Check if integration is being disabled/removed
    if (!provider || provider === "") {
      await db.delete(integrations)
        .where(and(eq(integrations.teamId, teamId), eq(integrations.role, role)));
      

      res.json(success({ role, message: "Integration removed" }));
      return;
    }

    const existing = await db.query.integrations.findFirst({
      where: and(eq(integrations.teamId, teamId), eq(integrations.role, role))
    });

    let integration;
    if (existing) {
      [integration] = await db
        .update(integrations)
        .set({ 
          provider: provider as any,
          apiKey: req.body.apiKey, 
          metadata: req.body.metadata,
          instructions: req.body.instructions
        })
        .where(eq(integrations.id, existing.id))
        .returning();
    } else {
      [integration] = await db
        .insert(integrations)
        .values({ 
          teamId, 
          provider: provider as any, 
          apiKey: req.body.apiKey,
          metadata: req.body.metadata,
          role: role,
          instructions: req.body.instructions
        })
        .returning();
    }



    res.json(success(integration));
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
