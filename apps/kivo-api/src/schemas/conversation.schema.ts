import { z } from "zod";

// ── Conversation ──────────────────────────────────────────────────────────────

export const createConversationSchema = z.object({
  agentId: z.string().uuid("agentId must be a valid UUID"),
  counterpartType: z.enum(["human", "agent", "external"]),
  counterpartId: z.string().optional(),
  counterpartName: z.string().min(1, "counterpartName is required"),
});

// ── Message ───────────────────────────────────────────────────────────────────

export const createMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1, "content is required"),
  tokenCount: z.number().int().nonnegative().optional(),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
