import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/client";
import { workspaces, workspaceLlmKeys, teams, agents } from "../db/schema";
import { authMiddleware } from "../middleware/authMiddleware";
import { success, failure } from "../lib/response";
import { updateWorkspaceTierSchema, saveWorkspaceLlmKeySchema } from "../schemas/workspace.schema";
import { PLANS } from "../config/plans";

function getDowngradeErrorMsg(lang: string, reason: "teams" | "agents", limit: number) {
  if (lang === "pt") {
    return reason === "teams" 
      ? `Não é possível alterar para este plano pois você possui mais times do que o limite permitido (${limit}).`
      : `Não é possível alterar para este plano pois um dos seus times possui mais agentes do que o limite permitido (${limit}).`;
  } else if (lang === "zh") {
    return reason === "teams"
      ? `无法更改为此套餐，因为您的团队数量超出了允许的限制 (${limit})。`
      : `无法更改为此套餐，因为您的某个团队中的智能体数量超出了允许的限制 (${limit})。`;
  }
  return reason === "teams"
    ? `Cannot change to this plan because you have more teams than the allowed limit (${limit}).`
    : `Cannot change to this plan because one of your teams has more agents than the allowed limit (${limit}).`;
}

export const workspacesRouter = Router();

const requireWorkspaceOwnership = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = String(req.params.id);
    if (!workspaceId || workspaceId === "undefined") return res.status(400).json(failure("Workspace ID is required"));

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, req.actor!.id)));

    if (!workspace) {
      return res.status(403).json(failure("Forbidden: You do not own this workspace"));
    }

    // Attach workspace to request for downstream use if needed
    (req as any).workspace = workspace;
    next();
  } catch (err) {
    next(err);
  }
};

// ── PUT /workspaces/:id/tier ──────────────────────────────────────────────────
workspacesRouter.put("/:id/tier", authMiddleware, requireWorkspaceOwnership, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tier } = updateWorkspaceTierSchema.parse(req.body);

    const limits = tier && tier !== "pro" ? PLANS[tier as keyof typeof PLANS] : PLANS.pro;
    const planLimits = limits ? {
      teamLimit: limits.teamLimit,
      agentsPerTeamLimit: limits.agentsPerTeamLimit,
      monthlyAutomationLimit: limits.monthlyAutomationLimit,
    } : {};

    if (limits) {
      const workspaceTeams = await db.select().from(teams).where(eq(teams.workspaceId, String(req.params.id)));
      
      if (limits.teamLimit !== null && workspaceTeams.length > limits.teamLimit) {
        return res.status(400).json(failure(getDowngradeErrorMsg((req as any).workspace.language, "teams", limits.teamLimit)));
      }

      if (limits.agentsPerTeamLimit !== null) {
        for (const team of workspaceTeams) {
          const teamAgents = await db.select().from(agents).where(eq(agents.teamId, team.id));
          if (teamAgents.length > limits.agentsPerTeamLimit) {
            return res.status(400).json(failure(getDowngradeErrorMsg((req as any).workspace.language, "agents", limits.agentsPerTeamLimit)));
          }
        }
      }
    }

    const [updated] = await db
      .update(workspaces)
      .set({ 
        tier,
        ...planLimits
      })
      .where(eq(workspaces.id, String(req.params.id)))
      .returning();

    res.json(success(updated));
  } catch (err) {
    next(err);
  }
});

// ── POST /workspaces/:id/llm-keys ──────────────────────────────────────────────
workspacesRouter.post("/:id/llm-keys", authMiddleware, requireWorkspaceOwnership, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider, apiKey, model } = saveWorkspaceLlmKeySchema.parse(req.body);
    const workspaceId = String(req.params.id);

    // Check if key already exists
    const [existing] = await db
      .select()
      .from(workspaceLlmKeys)
      .where(and(eq(workspaceLlmKeys.workspaceId, workspaceId), eq(workspaceLlmKeys.provider, provider)));

    let result;
    if (existing) {
      // Update existing key
      const [updated] = await db
        .update(workspaceLlmKeys)
        .set({ apiKey, model, updatedAt: new Date() }) // TODO: Encrypt apiKey before saving
        .where(eq(workspaceLlmKeys.id, existing.id))
        .returning();
      result = updated;
    } else {
      // Create new key
      const [created] = await db
        .insert(workspaceLlmKeys)
        .values({
          workspaceId,
          provider,
          apiKey, // TODO: Encrypt apiKey before saving
          model: model || null,
        })
        .returning();
      result = created;
    }

    res.json(success(result));
  } catch (err) {
    next(err);
  }
});

// ── GET /workspaces/:id/llm-keys ───────────────────────────────────────────────
workspacesRouter.get("/:id/llm-keys", authMiddleware, requireWorkspaceOwnership, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keys = await db
      .select({
        id: workspaceLlmKeys.id,
        provider: workspaceLlmKeys.provider,
        model: workspaceLlmKeys.model,
        updatedAt: workspaceLlmKeys.updatedAt,
        // We do NOT return the raw API key to the frontend for security.
        hasKey: sql<boolean>`true`.as('has_key')
      })
      .from(workspaceLlmKeys)
      .where(eq(workspaceLlmKeys.workspaceId, String(req.params.id)));

    res.json(success(keys));
  } catch (err) {
    next(err);
  }
});

// ── PUT /workspaces/:id/language ──────────────────────────────────────────────
workspacesRouter.put("/:id/language", authMiddleware, requireWorkspaceOwnership, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { language } = req.body;
    if (!language || !["en", "pt", "zh"].includes(language)) {
      return res.status(400).json(failure("Invalid language selection"));
    }

    const [updated] = await db
      .update(workspaces)
      .set({ language })
      .where(eq(workspaces.id, String(req.params.id)))
      .returning();

    res.json(success(updated));
  } catch (err) {
    next(err);
  }
});
