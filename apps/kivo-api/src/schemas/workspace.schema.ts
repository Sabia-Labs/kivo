import { z } from "zod";

export const updateWorkspaceTierSchema = z.object({
  tier: z.enum(["free", "basic", "pro"]),
});

export const saveWorkspaceLlmKeySchema = z.object({
  provider: z.enum(["openai", "gemini", "anthropic", "deepseek"]),
  apiKey: z.string().min(1, "API Key is required"),
  model: z.string().optional(),
});

export const updateWorkspaceModelsSchema = z.object({
  leaderLlmMode: z.enum(["platform", "byok"]).optional(),
  leaderLlmProvider: z.string().optional(),
  plannerLlmModel: z.string().optional(),
  leaderApiKey: z.string().optional(),
  executorLlmMode: z.enum(["platform", "byok"]).optional(),
  executorLlmProvider: z.string().optional(),
  executorLlmModel: z.string().optional(),
  executorApiKey: z.string().optional(),
});
