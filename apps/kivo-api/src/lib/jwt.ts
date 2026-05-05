import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "kivo-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";

export interface JwtPayload {
  userId: string;
  email: string;
}

/**
 * Signs a JWT for the given user payload.
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verifies and decodes a JWT. Returns the payload or throws if invalid.
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
