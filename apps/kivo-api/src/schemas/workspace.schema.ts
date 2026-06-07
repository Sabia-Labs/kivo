import { z } from "zod";

export const updateWorkspaceTierSchema = z.object({
  tier: z.enum(["free", "basic", "pro"]),
});

export const saveWorkspaceLlmKeySchema = z.object({
  provider: z.enum(["openai", "gemini", "anthropic", "deepseek"]),
  apiKey: z.string().min(1, "API Key is required"),
  model: z.string().optional(),
});
