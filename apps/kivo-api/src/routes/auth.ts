import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "../db/client";
import { authMiddleware } from "../middleware/authMiddleware";
import { success, failure } from "../lib/response";

export const authRouter = Router();

// NOTE: /auth/signup and /auth/login have moved to the Control Plane (admin-api)

// ── GET /auth/me ─────────────────────────────────────────────────────────────
// Still works by validating the JWT issued by admin-api
authRouter.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Note: We no longer have a 'users' table in this DB. 
    // We trust the JWT payload for basic identity.
    // If we need profile data, we might need to fetch it from admin-api.
    
    res.json(success({
      id: req.actor!.id,
      type: req.actor!.type,
    }));
  } catch (err) {
    next(err);
  }
});
