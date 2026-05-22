import { z } from "zod";

export const updateWorkspaceTierSchema = z.object({
  tier: z.enum(["free_byok", "pro"]).nullable(),
});

export const saveWorkspaceLlmKeySchema = z.object({
  provider: z.enum(["openai", "gemini", "anthropic", "deepseek"]),
  apiKey: z.string().min(1, "API Key is required"),
  model: z.string().optional(),
});

export const redeemVoucherSchema = z.object({
  code: z.string().min(1, "Voucher code is required"),
});
