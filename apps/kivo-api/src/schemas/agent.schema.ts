import { z } from "zod";

// ── Agent type enum ───────────────────────────────────────────────────────────

export const agentTypeSchema = z.enum([
  "team_lead",
  "software_engineer",
  "product_manager",
  "software_architect",
]);

// ── Agent metadata ────────────────────────────────────────────────────────────

export const agentMetadataSchema = z
  .object({
    avatarColor: z.string().optional(),
    telegramBotToken: z.string().optional(),
    telegramPairingCode: z.string().optional(),
    telegramStatus: z
      .enum(["not_configured", "registering", "registered", "complete"])
      .optional(),
    // Brain fields
    personality: z.string().optional(),
    identity: z.string().optional(),
    longTermMemory: z.string().optional(),
    // LLM model
    model: z.string().optional(),
  })
  .passthrough();

// ── Create / Update ───────────────────────────────────────────────────────────

export const createAgentSchema = z.object({
  teamId: z.string().uuid("teamId must be a valid UUID"),
  name: z.string().min(1, "name is required"),
  type: agentTypeSchema,
  icon: z.string().optional(),
  metadata: agentMetadataSchema.optional(),
});

export const updateAgentSchema = createAgentSchema.omit({ teamId: true }).partial();

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type AgentMetadata = z.infer<typeof agentMetadataSchema>;
