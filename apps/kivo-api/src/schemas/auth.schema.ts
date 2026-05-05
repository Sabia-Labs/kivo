import { z } from "zod";

// ── Signup ────────────────────────────────────────────────────────────────────

export const signupSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("invalid email"),
  password: z.string().min(8, "password must be at least 8 characters"),
  workspaceName: z.string().min(1, "workspace name is required"),
  teamName: z.string().optional(),      // falls back to workspaceName if omitted
  identifierPrefix: z.string().optional(),
  mission: z.string().optional(),       // falls back to a generated default
  waysOfWorking: z.string().optional(),
  agents: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.enum(["team_lead", "software_engineer", "product_manager", "software_architect"]),
      })
    )
    .optional(),
  template: z.enum(["starter", "engineering", "customer_support"]).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;

// ── Login ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("invalid email"),
  password: z.string().min(1, "password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
