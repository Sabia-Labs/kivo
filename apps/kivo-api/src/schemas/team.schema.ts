import { z } from "zod";

// ── Create / Update ───────────────────────────────────────────────────────────

export const createTeamSchema = z.object({
  workspaceId: z.string().uuid("workspaceId must be a valid UUID").optional(),
  userName: z.string().optional(),
  userEmail: z.string().optional(),
  name: z.string().min(1, "name is required"),
  identifierPrefix: z.string().min(1, "prefix is required").max(10, "prefix too long"),
  icon: z.string().optional(),
  mission: z.string().optional(),
  waysOfWorking: z.string().optional(),
  template: z.string().optional(), // Dynamic team type
  agents: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.string(), // Dynamic agent role
        icon: z.string().optional(),
      })
    )
    .optional(),
});

export const updateTeamSchema = createTeamSchema.partial();

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
