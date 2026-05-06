import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, gt } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { Resend } from "resend";
import { db } from "../db/client";
import { users, workspaces, verificationCodes } from "../db/schema";
import { loginSchema, signupSchema, otpSendSchema } from "../schemas/auth.schema";
import { signToken } from "../lib/jwt";
import { success, failure } from "../lib/response";

export const authRouter = Router();

const resend = new Resend(process.env.RESEND_API_KEY || "re_mock_key");
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:4001/auth/google/callback"
);

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4 digits
}

async function verifyCode(email: string, code: string) {
  const [record] = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.email, email),
        eq(verificationCodes.code, code),
        gt(verificationCodes.expiresAt, new Date())
      )
    )
    .limit(1);

  return !!record;
}

// ── Dev Login ────────────────────────────────────────────────────────────────
authRouter.post("/dev-login", async (req, res, next) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json(failure("Not found"));
  }

  try {
    // Hardcoded to seed user
    const devEmail = "wei.chen@acme.dev";
    const [user] = await db.select().from(users).where(eq(users.email, devEmail));
    
    if (!user) {
      return res.status(400).json(failure("Dev user not found in DB. Did you run make db-seed?"));
    }

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.userId, user.id));

    const token = signToken({ userId: user.id, email: user.email, isAdmin: user.isAdmin });
    res.json(success({
      token,
      user: { id: user.id, email: user.email, isAdmin: user.isAdmin },
      teamId: workspace?.id || null
    }));
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/otp/send ──────────────────────────────────────────────────────
authRouter.post("/otp/send", async (req, res, next) => {
  try {
    const { email } = otpSendSchema.parse(req.body);
    const code = generateCode();
    
    // Expires in 15 minutes
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await db.insert(verificationCodes).values({
      email,
      code,
      expiresAt,
    });

    if (process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY) {
      console.log(`\n\n🔑 [DEV MODE] OTP Code for ${email}: ${code}\n\n`);
    } else {
      await resend.emails.send({
        from: "Kivo <noreply@kivo.app>",
        to: email,
        subject: "Your Kivo Login Code",
        html: `<p>Your login code is: <strong>${code}</strong></p><p>It will expire in 15 minutes.</p>`,
      });
    }

    res.json(success({ message: "OTP sent" }));
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/login/verify ──────────────────────────────────────────────────
authRouter.post("/login/verify", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const isValid = await verifyCode(input.email, input.code);

    if (!isValid) {
      return res.status(401).json(failure("Invalid or expired code"));
    }

    const [user] = await db.select().from(users).where(eq(users.email, input.email));
    if (!user) {
      return res.status(404).json(failure("User not found. Please sign up."));
    }

    // Clean up code
    await db.delete(verificationCodes).where(eq(verificationCodes.email, input.email));

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.userId, user.id));

    const token = signToken({ userId: user.id, email: user.email, isAdmin: user.isAdmin });
    res.json(success({
      token,
      user: { id: user.id, email: user.email, isAdmin: user.isAdmin },
      teamId: workspace?.id || null
    }));
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/signup/verify ─────────────────────────────────────────────────
authRouter.post("/signup/verify", async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);
    const isValid = await verifyCode(input.email, input.code);

    if (!isValid) {
      return res.status(401).json(failure("Invalid or expired code"));
    }

    const existing = await db.select().from(users).where(eq(users.email, input.email));
    if (existing.length > 0) {
      return res.status(409).json(failure("A user with this email already exists"));
    }

    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email })
        .returning();

      const [workspace] = await tx
        .insert(workspaces)
        .values({ userId: user.id, name: input.workspaceName })
        .returning();

      const [updatedWorkspace] = await tx
        .update(workspaces)
        .set({ k8sNamespace: `kivo-ws-${workspace.id.substring(0, 8)}` })
        .where(eq(workspaces.id, workspace.id))
        .returning();

      return { user, workspace: updatedWorkspace };
    });

    await db.delete(verificationCodes).where(eq(verificationCodes.email, input.email));

    // Sync with kivo-api (application plane)
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
    } catch (err) {
      console.error("[admin-api] Critical: Failed to sync with kivo-api:", err);
    }

    const token = signToken({ userId: result.user.id, email: result.user.email, isAdmin: result.user.isAdmin });
    res.status(201).json(success({
      token,
      user: { id: result.user.id, email: result.user.email },
      workspace: { id: result.workspace.id, name: result.workspace.name }
    }));
  } catch (err) {
    next(err);
  }
});

// ── GET /auth/google ─────────────────────────────────────────────────────────
authRouter.get("/google", (req, res) => {
  const url = googleClient.generateAuthUrl({
    access_type: "offline",
    scope: ["email", "profile"],
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:4001/auth/google/callback"
  });
  res.redirect(url);
});

// ── GET /auth/google/callback ────────────────────────────────────────────────
authRouter.get("/google/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    const userInfoResponse = await googleClient.request<{email: string}>({
      url: "https://www.googleapis.com/oauth2/v3/userinfo",
    });

    const email = userInfoResponse.data.email;
    if (!email) {
      return res.status(400).send("No email found from Google.");
    }

    let [user] = await db.select().from(users).where(eq(users.email, email));
    
    // If it's a new user, create them (Note: we don't have a workspace name yet, 
    // we might need to handle this differently in a real app, 
    // e.g. redirect to a "complete profile" page. For now we use a default workspace name)
    let workspaceId = null;
    if (!user) {
      const result = await db.transaction(async (tx) => {
        const [newUser] = await tx.insert(users).values({ email }).returning();
        const [newWorkspace] = await tx.insert(workspaces).values({ userId: newUser.id, name: email.split('@')[0] }).returning();
        
        await tx.update(workspaces)
          .set({ k8sNamespace: `kivo-ws-${newWorkspace.id.substring(0, 8)}` })
          .where(eq(workspaces.id, newWorkspace.id));
          
        return { user: newUser, workspace: newWorkspace };
      });
      user = result.user;
      workspaceId = result.workspace.id;
    } else {
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.userId, user.id));
      workspaceId = workspace?.id;
    }

    const token = signToken({ userId: user.id, email: user.email, isAdmin: user.isAdmin });
    
    // Redirect to frontend with token
    const ADMIN_WEB_URL = process.env.ADMIN_WEB_URL || "http://localhost:3001";
    res.redirect(`${ADMIN_WEB_URL}/auth/callback?token=${token}&userId=${user.id}&workspaceId=${workspaceId || ""}`);
  } catch (err) {
    console.error("Google Auth Error:", err);
    res.status(500).send("Authentication failed");
  }
});
