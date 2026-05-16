import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { integrations, workspaces, teams, agents } from "../db/schema";
import { createIntegrationSchema } from "../schemas/integration.schema";
import { authMiddleware } from "../middleware/authMiddleware";
import { success, failure } from "../lib/response";
import { applyCredentialsSecret, rolloutRestartDeployment } from "../k8s/provisioner";

export const integrationsRouter = Router({ mergeParams: true });

// ── Sync with Kubernetes ──────────────────────────────────────────────────────
async function syncTeamAgentsToK8s(teamId: string, team: any) {
  const teamAgents = await db.select().from(agents).where(eq(agents.teamId, teamId));
  
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, team.workspaceId))
    .limit(1);

  if (workspace) {
    for (const agent of teamAgents) {
      const namespace = workspace.k8sNamespace || `kivo-ws-${workspace.id.substring(0, 8)}`;
      try {
        await applyCredentialsSecret(namespace, agent);
        await rolloutRestartDeployment(namespace, agent.id);
        console.log(`[integrations] Triggered secret update and restart for agent ${agent.id}`);
      } catch (err) {
        console.error(`[integrations] Failed to sync agent ${agent.id} to k8s:`, err);
      }
    }
  }
}

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

    await syncTeamAgentsToK8s(teamId, team);

    res.status(201).json(success(integration));
  } catch (err) {
    next(err);
  }
});

// ── PUT /teams/:id/integrations/:provider ─────────────────────────────────────

integrationsRouter.put("/:provider", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teamId = String(req.params.id);
    const provider = String(req.params.provider);

    // Verify team exists.
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) {
      res.status(404).json(failure("Team not found"));
      return;
    }

    const input = createIntegrationSchema.partial().parse(req.body);

    // Check if exists
    const [existing] = await db
      .select()
      .from(integrations)
      .where(and(eq(integrations.teamId, teamId), eq(integrations.provider, provider as any)));

    let integration;
    if (existing) {
      [integration] = await db
        .update(integrations)
        .set(input)
        .where(eq(integrations.id, existing.id))
        .returning();
    } else {
      [integration] = await db
        .insert(integrations)
        .values({ 
          teamId, 
          provider: provider as any, 
          apiKey: input.apiKey,
          metadata: input.metadata 
        })
        .returning();
    }

    await syncTeamAgentsToK8s(teamId, team);

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
