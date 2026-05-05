import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { failure } from "../lib/response";

/**
 * Global Express error handler.
 * Converts ZodErrors to 400 validation responses and all other errors to 500.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    console.warn("[validation_error]", JSON.stringify(err.flatten().fieldErrors, null, 2));
    res.status(400).json(failure("Validation error", err.flatten().fieldErrors));
    return;
  }

  console.error("[error]", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json(failure(message));
}
