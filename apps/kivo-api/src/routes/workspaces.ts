import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/client";
import { workspaces, workspaceLlmKeys, vouchers, teams, agents } from "../db/schema";
import { authMiddleware } from "../middleware/authMiddleware";
import { success, failure } from "../lib/response";
import { updateWorkspaceTierSchema, saveWorkspaceLlmKeySchema, redeemVoucherSchema } from "../schemas/workspace.schema";

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

    const [updated] = await db
      .update(workspaces)
      .set({ tier })
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

    // Ensure tier is set to free_byok if not already set or changing from pro
    await db.update(workspaces).set({ tier: "free_byok" }).where(eq(workspaces.id, workspaceId));


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

// ── POST /workspaces/:id/redeem-voucher ────────────────────────────────────────
workspacesRouter.post("/:id/redeem-voucher", authMiddleware, requireWorkspaceOwnership, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = redeemVoucherSchema.parse(req.body);
    const workspaceId = String(req.params.id);

    // Check if voucher exists and is available
    const [voucher] = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.code, code));

    if (!voucher) {
      return res.status(404).json(failure("Voucher not found"));
    }

    if (voucher.status !== "available") {
      return res.status(400).json(failure("Voucher has already been redeemed or is invalid"));
    }

    // Redeem voucher within a transaction
    await db.transaction(async (tx) => {
      await tx
        .update(vouchers)
        .set({
          status: "redeemed",
          redeemedByWorkspaceId: workspaceId,
          redeemedAt: new Date(),
        })
        .where(eq(vouchers.id, voucher.id));

      await tx
        .update(workspaces)
        .set({ tier: "pro" })
        .where(eq(workspaces.id, workspaceId));
    });


    res.json(success({ message: "Voucher redeemed successfully", tier: "pro" }));
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
