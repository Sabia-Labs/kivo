import { Router, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { Resend } from "resend";
import { db } from "../db/client";
import { users, workspaces, verificationCodes } from "../db/schema";
import { loginSchema, signupSchema, otpSendSchema } from "../schemas/auth.schema";
import { signToken } from "../lib/jwt";
import { authMiddleware } from "../middleware/authMiddleware";
import { success, failure } from "../lib/response";
import { PLANS } from "../config/plans";

export const authRouter = Router();

const resend = new Resend(process.env.RESEND_API_KEY || "re_mock_key");
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/auth/google/callback"
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

// ── GET /auth/me ─────────────────────────────────────────────────────────────
authRouter.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.actor) {
      return res.status(401).json(failure("Unauthorized"));
    }
    
    // Fetch full user if it's a human actor
    if (req.actor.type === "human") {
      const [user] = await db.select().from(users).where(eq(users.id, req.actor.id));
      if (!user) {
        return res.status(404).json(failure("User not found"));
      }
      return res.json(success({
        id: req.actor.id,
        type: req.actor.type,
        user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin }
      }));
    }

    res.json(success({
      id: req.actor.id,
      type: req.actor.type,
    }));
  } catch (err) {
    next(err);
  }
});

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

    console.log("[auth/otp/send] Verification code generated", {
      email,
      expiresAt: expiresAt.toISOString(),
      deliveryMode:
        process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY ? "console" : "resend",
    });

    if (process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY) {
      console.log(`\n\n🔑 [DEV MODE] OTP Code for ${email}: ${code}\n\n`);
      console.log("[auth/otp/send] DEV delivery complete", { email });
    } else {
      console.log("[auth/otp/send] Sending OTP via Resend", { email });
      const resendResponse = await resend.emails.send({
        from: "Sabia Labs <noreply@auth.sabialabs.de>",
        to: email,
        subject: "Your Kivo Login Code",
        html: `<p>Your login code is: <strong>${code}</strong></p><p>It will expire in 15 minutes.</p>`,
      });
      console.log("[auth/otp/send] Resend response", {
        email,
        data: resendResponse.data,
        error: resendResponse.error,
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

    const token = signToken({ 
      userId: user.id, 
      email: user.email, 
      name: user.name || user.email.split('@')[0],
      isAdmin: user.isAdmin 
    });
    res.json(success({
      token,
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin },
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
        .values({ 
          id: randomUUID(),
          email: input.email,
          name: input.email.split('@')[0]
        })
        .returning();

      const acceptLang = req.headers["accept-language"] || "";
      let lang = input.language || "en";
      if (!input.language) {
        if (acceptLang.startsWith("pt")) lang = "pt";
        else if (acceptLang.startsWith("zh")) lang = "zh";
      }

      const [workspace] = await tx
        .insert(workspaces)
        .values({ 
          id: randomUUID(),
          userId: user.id, 
          name: input.workspaceName,
          langchain: true,
          tier: "free",
          language: lang,
          teamLimit: PLANS.free.teamLimit,
          agentsPerTeamLimit: PLANS.free.agentsPerTeamLimit,
          monthlyAutomationLimit: PLANS.free.monthlyAutomationLimit,
        })
        .returning();

      const [updatedWorkspace] = await tx
        .update(workspaces)
        .set({ k8sNamespace: process.env.KIVO_SHARED_NAMESPACE || `kivo-ws-${workspace.id.substring(0, 8)}` })
        .where(eq(workspaces.id, workspace.id))
        .returning();

      return { user, workspace: updatedWorkspace };
    });

    await db.delete(verificationCodes).where(eq(verificationCodes.email, input.email));

    const token = signToken({ 
      userId: result.user.id, 
      email: result.user.email, 
      name: result.user.name || result.user.email.split('@')[0],
      isAdmin: result.user.isAdmin 
    });
    res.status(201).json(success({
      token,
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      workspace: { id: result.workspace.id, name: result.workspace.name }
    }));
  } catch (err) {
    next(err);
  }
});

// ── GET /auth/google ─────────────────────────────────────────────────────────
authRouter.get("/google", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error("[auth/google] Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env vars");
    return res.status(500).send("Google OAuth is not configured");
  }

  const url = googleClient.generateAuthUrl({
    access_type: "offline",
    scope: ["email", "profile"],
    prompt: "select_account",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/auth/google/callback"
  });
  res.redirect(url);
});

// ── GET /auth/google/callback ────────────────────────────────────────────────
authRouter.get("/google/callback", async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error("[auth/google/callback] Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env vars");
      return res.status(500).send("Google OAuth is not configured");
    }

    const code = req.query.code as string;
    if (!code) {
      console.error("[auth/google/callback] Missing authorization code", {
        query: req.query,
      });
      return res.status(400).send("Missing Google authorization code");
    }
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    const userInfoResponse = await googleClient.request<{email: string, name: string}>({
      url: "https://www.googleapis.com/oauth2/v3/userinfo",
    });

    const email = userInfoResponse.data.email;
    const name = userInfoResponse.data.name;
    if (!email) {
      return res.status(400).send("No email found from Google.");
    }

    let [user] = await db.select().from(users).where(eq(users.email, email));
    
    // If it's a new user, create them
    let workspaceId = null;
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const result = await db.transaction(async (tx) => {
        const [newUser] = await tx.insert(users).values({ 
          id: randomUUID(),
          email,
          name: name || email.split('@')[0]
        }).returning();

        const inputLang = req.query.lang as string;
        const acceptLang = req.headers["accept-language"] || "";
        let lang = inputLang || "en";
        if (!inputLang) {
          if (acceptLang.startsWith("pt")) lang = "pt";
          else if (acceptLang.startsWith("zh")) lang = "zh";
        }

        const [newWorkspace] = await tx.insert(workspaces).values({ 
          id: randomUUID(),
          userId: newUser.id, 
          name: email.split('@')[0],
          langchain: true,
          tier: "free",
          language: lang,
          teamLimit: PLANS.free.teamLimit,
          agentsPerTeamLimit: PLANS.free.agentsPerTeamLimit,
          monthlyAutomationLimit: PLANS.free.monthlyAutomationLimit,
        }).returning();
        
        await tx.update(workspaces)
          .set({ k8sNamespace: process.env.KIVO_SHARED_NAMESPACE || `kivo-ws-${newWorkspace.id.substring(0, 8)}` })
          .where(eq(workspaces.id, newWorkspace.id));
          
        return { user: newUser, workspace: newWorkspace };
      });
      user = result.user;
      workspaceId = result.workspace.id;
    } else {
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.userId, user.id));
      workspaceId = workspace?.id;
    }

    const token = signToken({ 
      userId: user.id, 
      email: user.email, 
      name: user.name || user.email.split('@')[0],
      isAdmin: user.isAdmin 
    });
    
    // Redirect to frontend with token
    const ADMIN_WEB_URL = process.env.ADMIN_WEB_URL || "";
    if (!ADMIN_WEB_URL) {
      console.error("[auth/google/callback] Error: ADMIN_WEB_URL is not defined");
      return res.status(500).send("Server configuration error: Missing ADMIN_WEB_URL");
    }
    res.redirect(`${ADMIN_WEB_URL}/auth/callback?token=${token}&userId=${user.id}&workspaceId=${workspaceId || ""}&isNew=${isNewUser}`);
  } catch (err) {
    console.error("[auth/google/callback] Google Auth Error:", {
      error: err,
      redirectUri: process.env.GOOGLE_REDIRECT_URI,
      hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    });
    res.status(500).send("Authentication failed");
  }
});
