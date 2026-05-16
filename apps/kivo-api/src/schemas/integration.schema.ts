import { z } from "zod";

// ── Integration providers ─────────────────────────────────────────────────────

export const pmProviders = ["linear", "jira", "trello"] as const;
export const integrationProviders = [...pmProviders, "github", "notion"] as const;

export const createIntegrationSchema = z.object({
  provider: z.enum(integrationProviders),
  apiKey: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;
