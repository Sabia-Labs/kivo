import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { db } from "../../../db/client";
import { workspaces, workspaceLlmKeys, teams, llmModels } from "../../../db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load .env files from the directory tree upwards to ensure local and root .env settings are respected
const loadEnv = () => {
  dotenv.config();
  let dir = __dirname;
  const envFiles: string[] = [];
  while (dir && dir !== path.parse(dir).root) {
    const envPath = path.join(dir, ".env");
    if (fs.existsSync(envPath)) {
      envFiles.push(envPath);
    }
    dir = path.dirname(dir);
  }
  envFiles.reverse().forEach(filePath => {
    dotenv.config({ path: filePath });
  });
};
loadEnv();

export class LLMFactory {
  /**
   * Instantiates a LangChain Chat Model dynamically based on provider configs
   * @param role 'planner' | 'executor' | 'orchestrator' | 'agent' | 'leader' | 'fieldInsights'
   */
  public static async createModel(
    role: "planner" | "executor" | "orchestrator" | "agent" | "leader" | "fieldInsights",
    context?: { workspaceId?: string; teamId?: string }
  ): Promise<BaseChatModel> {
    let provider = "";
    let model = "";
    let costPerCall = 0.0;
    let apiKeyFromDb: string | undefined;
    let llmMode: string = "platform";

    let targetWorkspaceId = context?.workspaceId;
    if (!targetWorkspaceId && context?.teamId) {
      const [team] = await db.select().from(teams).where(eq(teams.id, context.teamId));
      if (team) targetWorkspaceId = team.workspaceId;
    }

    if (targetWorkspaceId) {
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, targetWorkspaceId));
      if (workspace) {
        const tier = workspace.tier || "free";
        const isLeaderRole = role === "planner" || role === "orchestrator" || role === "leader" || role === "fieldInsights";
        llmMode = isLeaderRole ? workspace.leaderLlmMode : workspace.executorLlmMode;

        model = isLeaderRole ? workspace.plannerLlmModel || "" : workspace.executorLlmModel || "";

        const [dbModel] = await db.select({ costPerCall: llmModels.costPerCall, provider: llmModels.provider }).from(llmModels).where(eq(llmModels.id, model));
        
        if (dbModel) {
          provider = dbModel.provider;
        }

        if (llmMode === "byok") {
          costPerCall = 0.0; // BYOK calls are free of platform AI credits
        } else {
          if (dbModel) {
            costPerCall = dbModel.costPerCall;
          } else {
            costPerCall = 0.1;
          }
        }

        if (costPerCall > 0 && workspace.aiCreditsUsed >= workspace.aiCreditsLimit) {
          throw new Error(
            `Insufficient AI credits. Your workspace has used ${workspace.aiCreditsUsed}/${workspace.aiCreditsLimit} credits.`
          );
        }

        if (provider && provider !== "local") {
          const [key] = await db
            .select()
            .from(workspaceLlmKeys)
            .where(
              and(
                eq(workspaceLlmKeys.workspaceId, targetWorkspaceId),
                eq(workspaceLlmKeys.provider, provider as any)
              )
            );
          if (key && key.apiKey) {
            apiKeyFromDb = key.apiKey;
          }
        }
      }
    }

    // Default ENV fallbacks
    if (!provider || !model) {
      const roleUpper = role.toUpperCase();
      provider = provider || process.env[`${roleUpper}_PROVIDER`]?.trim().toLowerCase() || (role === "executor" || role === "agent" ? "local" : "openai");
      model = model || process.env[`${roleUpper}_MODEL`]?.trim() || (role === "executor" || role === "agent" ? "qwen2.5-coder:1.5b" : "gpt-5.4-mini");
    }

    console.log(`\x1b[35m[LLMFactory] Instantiating model for role "${role}": provider="${provider}", model="${model}" (cost: ${costPerCall})\x1b[0m`);

    const callbacks: any[] = [];
    if (targetWorkspaceId && costPerCall > 0) {
      callbacks.push({
        handleLLMStart: async () => {
          const [ws] = await db
            .select({
              aiCreditsUsed: workspaces.aiCreditsUsed,
              aiCreditsLimit: workspaces.aiCreditsLimit,
            })
            .from(workspaces)
            .where(eq(workspaces.id, targetWorkspaceId!));

          if (ws && ws.aiCreditsUsed >= ws.aiCreditsLimit) {
            throw new Error(`Insufficient AI credits. Workspace usage: ${ws.aiCreditsUsed}/${ws.aiCreditsLimit}`);
          }

          await db
            .update(workspaces)
            .set({
              aiCreditsUsed: sql`${workspaces.aiCreditsUsed} + ${costPerCall}`,
            })
            .where(eq(workspaces.id, targetWorkspaceId!));
          console.log(`[LLMFactory] Deducted ${costPerCall} credits from workspace ${targetWorkspaceId}.`);
        },
      });
    }

    switch (provider) {
      case "local": {
        const baseURL = process.env.LOCAL_LLM_BASE_URL || process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434/v1";
        console.log(`[LLMFactory] Connecting to local LLM at ${baseURL} with model "${model || "qwen2.5-coder:1.5b"}"`);
        return new ChatOpenAI({
          model: model || "qwen2.5-coder:1.5b",
          temperature: 0.0,
          apiKey: "local",
          callbacks,
          configuration: {
            baseURL,
          },
        });
      }
      
      case "openai": {
        let apiKey = apiKeyFromDb;
        if (!apiKey && llmMode === "platform") {
          apiKey = process.env.PLATFORM_OPENAI_API_KEY;
        }
        if (!apiKey) {
          throw new Error(llmMode === "byok" ? "BYOK Mode Error: No OpenAI API key provided in workspace configuration." : "Platform Mode Error: PLATFORM_OPENAI_API_KEY is not configured.");
        }
        const finalModel = model || "gpt-5.4-mini";
        const isReasoningModel = finalModel.startsWith("o1") || finalModel.startsWith("o3") || finalModel.startsWith("gpt-5.5");
        
        return new ChatOpenAI({
          model: finalModel,
          temperature: isReasoningModel ? 1 : 0.0,
          apiKey,
          callbacks,
          maxTokens: 2048
        });
      }

      case "openrouter": {
        let apiKey = apiKeyFromDb;
        if (!apiKey && llmMode === "platform") {
          apiKey = process.env.PLATFORM_OPENROUTER_API_KEY;
        }
        if (!apiKey) {
          throw new Error(llmMode === "byok" ? "BYOK Mode Error: No OpenRouter API key provided in workspace configuration." : "Platform Mode Error: PLATFORM_OPENROUTER_API_KEY is not configured.");
        }
        return new ChatOpenAI({
          model: model || "google/gemma-2-9b-it:free",
          temperature: 0.0,
          apiKey,
          callbacks,
          configuration: {
            baseURL: "https://openrouter.ai/api/v1"
          },
          maxTokens: 2048
        });
      }

      case "anthropic": {
        let apiKey = apiKeyFromDb;
        if (!apiKey && llmMode === "platform") {
          apiKey = process.env.PLATFORM_ANTHROPIC_API_KEY;
        }
        if (!apiKey) {
          throw new Error(llmMode === "byok" ? "BYOK Mode Error: No Anthropic API key provided in workspace configuration." : "Platform Mode Error: PLATFORM_ANTHROPIC_API_KEY is not configured.");
        }
        return new ChatOpenAI({
          model: model || "claude-3-haiku-20240307",
          temperature: 0.0,
          apiKey,
          callbacks,
          maxTokens: 2048
        });
      }

      case "deepseek": {
        let apiKey = apiKeyFromDb;
        if (!apiKey && llmMode === "platform") {
          apiKey = process.env.PLATFORM_DEEPSEEK_API_KEY;
        }
        if (!apiKey) {
          throw new Error(llmMode === "byok" ? "BYOK Mode Error: No DeepSeek API key provided in workspace configuration." : "Platform Mode Error: PLATFORM_DEEPSEEK_API_KEY is not configured.");
        }
        return new ChatOpenAI({
          model: model || "deepseek-chat",
          temperature: 0.0,
          apiKey,
          callbacks,
          configuration: {
            baseURL: "https://api.deepseek.com"
          },
          maxTokens: 2048
        });
      }

      case "gemini": {
        let apiKey = apiKeyFromDb;
        if (!apiKey && llmMode === "platform") {
          apiKey = process.env.PLATFORM_GEMINI_API_KEY;
        }
        if (!apiKey) {
          throw new Error(llmMode === "byok" ? "BYOK Mode Error: No Gemini API key provided in workspace configuration." : "Platform Mode Error: PLATFORM_GEMINI_API_KEY is not configured.");
        }
        return new ChatOpenAI({
          model: model || "gemini-3.5-flash",
          temperature: 0.0,
          apiKey,
          callbacks,
          configuration: {
            baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
          }
        });
      }

      default:
        throw new Error(`Unsupported LLM provider: "${provider}" for role "${role}"`);
    }
  }
}
