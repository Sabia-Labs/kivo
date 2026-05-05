import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { agents } from "../db/schema";
import { verifyToken } from "../lib/jwt";
import { failure } from "../lib/response";

/** Minimal actor context attached to the request after authentication. */
export interface ActorContext {
  id: string; // userId for humans, agentId for agents
  type: "human" | "agent";
  teamId?: string; // Strictly bound for agents
}

// Augment Express request type to carry the authenticated actor.
declare global {
  namespace Express {
    interface Request {
      actor?: ActorContext;
    }
  }
}

/**
 * Unified authentication middleware for both Humans (JWT) and Agents (Gateway Token).
 *
 * This middleware replaces both authMiddleware and agentAuthMiddleware.
 * 1. Checks for Authorization: Bearer <token>
 * 2. Tries to decode as JWT. If valid, type = 'human'.
 * 3. If JWT fails, tries to find <token> in the agents table. If found, type = 'agent'.
 * 4. If both fail, returns 401.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let token = "";
  
  const header = req.headers.authorization;
  if (header) {
    const isBearer = /^bearer\s+/i.test(header);
    if (!isBearer) {
      res.status(401).json(failure("Malformed Authorization header: Prefix must be 'Bearer '"));
      return;
    }
    // Node.js concatenates multiple headers with commas. We just want the first token.
    const rawToken = header.split(/\s+/)[1]?.trim() || "";
    token = rawToken.split(',')[0];
  } else if (req.query.token) {
    const t = req.query.token;
    token = Array.isArray(t) ? String(t[0]) : String(t);
    // Ensure the header is set for downstream logic (like internalFetch)
    req.headers.authorization = `Bearer ${token}`;
  }

  if (!token) {
    res.status(401).json(failure("Missing Authorization header or token query parameter"));
    return;
  }

  // ── 1. Try Human (JWT) ──────────────────────────────────────────────────
  try {
    const payload = verifyToken(token);
    if (payload && payload.userId) {
      req.actor = { id: payload.userId, type: "human" };
      return next();
    }
  } catch (err) {
    // JWT validation failed, falling through to check Agent token...
  }

  // ── 2. Try Agent (Gateway Token) ────────────────────────────────────────
  try {
    const [agent] = await db
      .select({ id: agents.id, teamId: agents.teamId })
      .from(agents)
      .where(eq(agents.gatewayToken, token))
      .limit(1);

    if (agent) {
      req.actor = { id: agent.id, type: "agent", teamId: agent.teamId };
      return next();
    } else {
      console.warn(`[auth] Agent token not found in DB: "${token}"`);
    }
  } catch (err) {
    return next(err);
  }

  // ── 3. Both failed ──────────────────────────────────────────────────────
  console.warn(`[auth] Both human and agent auth failed for token: "${token}"`);
  res.status(401).json(failure("Invalid or expired token"));
}
