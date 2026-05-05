import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users, workspaces } from "../db/schema";
import { loginSchema, signupSchema } from "../schemas/auth.schema";
import { signToken } from "../lib/jwt";
import { success, failure } from "../lib/response";

export const authRouter = Router();

// ── POST /auth/login ─────────────────────────────────────────────────────────
authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, input.email));

    if (!user) {
      return res.status(401).json(failure("Invalid email or password"));
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json(failure("Invalid email or password"));
    }

    const token = signToken({ 
      userId: user.id, 
      email: user.email, 
      isAdmin: user.isAdmin 
    });

    res.json(success({
      token,
      user: { id: user.id, email: user.email, isAdmin: user.isAdmin }
    }));
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/signup (Admin only in the future) ─────────────────────────────
authRouter.post("/signup", async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);

    const existing = await db.select().from(users).where(eq(users.email, input.email));
    if (existing.length > 0) {
      return res.status(409).json(failure("A user with this email already exists"));
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash })
        .returning();

      const [workspace] = await tx
        .insert(workspaces)
        .values({
          userId: user.id,
          name: input.workspaceName,
        })
        .returning();

      // Update with deterministic namespace
      const [updatedWorkspace] = await tx
        .update(workspaces)
        .set({ k8sNamespace: `kivo-ws-${workspace.id.substring(0, 8)}` })
        .where(eq(workspaces.id, workspace.id))
        .returning();

      return { user, workspace: updatedWorkspace };
    });

    // ── Synchronization with Application Plane (kivo-api) ───────────────────
    const KIVO_API_INTERNAL_URL = process.env.KIVO_API_INTERNAL_URL ?? "http://kivo-api.kivo:4000";
    try {
      await fetch(`${KIVO_API_INTERNAL_URL}/internal/provision-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: result.user.id,
          userEmail: result.user.email,
          userName: result.user.email.split("@")[0],
          workspaceId: result.workspace.id,
          workspaceName: result.workspace.name,
        }),
      });
      console.log(`[admin-api] Synced workspace ${result.workspace.id} to kivo-api`);
    } catch (err) {
      console.error("[admin-api] Critical: Failed to sync with kivo-api:", err);
      // In production, you might want to retry or rollback, but for now we log it.
    }

    const token = signToken({ 
      userId: result.user.id, 
      email: result.user.email, 
      isAdmin: result.user.isAdmin 
    });

    res.status(201).json(success({
      token,
      user: { id: result.user.id, email: result.user.email },
      workspace: { id: result.workspace.id, name: result.workspace.name }
    }));
  } catch (err) {
    next(err);
  }
});
