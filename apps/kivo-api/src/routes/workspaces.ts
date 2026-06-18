import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { workspaces, workspaceLlmKeys, teams, agents, llmModels, plans } from "../db/schema";
import { authMiddleware } from "../middleware/authMiddleware";
import { success, failure } from "../lib/response";
import { updateWorkspaceTierSchema, saveWorkspaceLlmKeySchema, updateWorkspaceModelsSchema } from "../schemas/workspace.schema";

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

// ── GET /workspaces/:id ───────────────────────────────────────────────────────
workspacesRouter.get("/:id", authMiddleware, requireWorkspaceOwnership, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(success((req as any).workspace));
  } catch (err) {
    next(err);
  }
});

// ── PUT /workspaces/:id/tier ──────────────────────────────────────────────────
workspacesRouter.put("/:id/tier", authMiddleware, requireWorkspaceOwnership, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tier } = updateWorkspaceTierSchema.parse(req.body);

    const [limits] = await db.select().from(plans).where(eq(plans.tier, tier));
    if (!limits) {
       return res.status(400).json(failure("Invalid plan tier"));
    }

    const planLimits = {
      teamLimit: limits.teamLimit,
      agentsPerTeamLimit: limits.agentsPerTeamLimit,
      monthlyAutomationLimit: limits.monthlyAutomationLimit,
      aiCreditsLimit: limits.dailyAiCredits,
    };

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

    const [leaderDb] = await db.select().from(llmModels).where(eq(llmModels.id, limits.defaultLeaderModel || ""));
    const [executorDb] = await db.select().from(llmModels).where(eq(llmModels.id, limits.defaultExecutorModel || ""));

    const [updated] = await db
      .update(workspaces)
      .set({ 
        tier,
        plannerLlmModel: leaderDb?.id || "gpt-5.4-mini",
        executorLlmModel: executorDb?.id || "qwen2.5-coder:1.5b",
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
    if (!language || !["en", "pt", "de", "zh"].includes(language)) {
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

// ── GET /workspaces/:id/available-models ───────────────────────────────────────
workspacesRouter.get("/:id/available-models", authMiddleware, requireWorkspaceOwnership, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const models = await db
      .select()
      .from(llmModels);

    res.json(success(models));
  } catch (err) {
    next(err);
  }
});

// ── PUT /workspaces/:id/models ───────────────────────────────────────────────
workspacesRouter.put("/:id/models", authMiddleware, requireWorkspaceOwnership, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = String(req.params.id);
    const {
      leaderLlmMode,
      leaderLlmProvider,
      plannerLlmModel,
      leaderApiKey,
      executorLlmMode,
      executorLlmProvider,
      executorLlmModel,
      executorApiKey,
    } = updateWorkspaceModelsSchema.parse(req.body);

    const saveApiKey = async (provider: string, apiKey: string) => {
      const [existing] = await db
        .select()
        .from(workspaceLlmKeys)
        .where(and(eq(workspaceLlmKeys.workspaceId, workspaceId), eq(workspaceLlmKeys.provider, provider as any)));
      if (existing) {
        await db
          .update(workspaceLlmKeys)
          .set({ apiKey, updatedAt: new Date() })
          .where(eq(workspaceLlmKeys.id, existing.id));
      } else {
        await db
          .insert(workspaceLlmKeys)
          .values({
            workspaceId,
            provider: provider as any,
            apiKey,
          });
      }
    };

    if (leaderLlmProvider && leaderApiKey) {
      await saveApiKey(leaderLlmProvider, leaderApiKey);
    }
    if (executorLlmProvider && executorApiKey) {
      await saveApiKey(executorLlmProvider, executorApiKey);
    }

    const updateData: any = {};
    if (leaderLlmMode !== undefined) {
      updateData.leaderLlmMode = leaderLlmMode;
    }
    if (plannerLlmModel !== undefined) {
      updateData.plannerLlmModel = plannerLlmModel;
    }

    if (executorLlmMode !== undefined) {
      updateData.executorLlmMode = executorLlmMode;
    }
    if (executorLlmModel !== undefined) {
      updateData.executorLlmModel = executorLlmModel;
    }

    const [updated] = await db
      .update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, workspaceId))
      .returning();

    res.json(success(updated));
  } catch (err) {
    next(err);
  }
});
