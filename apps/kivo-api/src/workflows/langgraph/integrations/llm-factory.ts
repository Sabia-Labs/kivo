import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
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
   * Instantiates a LangChain Chat Model dynamically based on provider configs in .env
   * @param role 'planner' | 'executor' | 'orchestrator'
   */
  public static createModel(role: "planner" | "executor" | "orchestrator"): BaseChatModel {
    const roleUpper = role.toUpperCase(); // "PLANNER", "EXECUTOR", or "ORCHESTRATOR"
    
    // Read provider and model name from env
    let provider = process.env[`${roleUpper}_PROVIDER`]?.trim().toLowerCase();
    let model = process.env[`${roleUpper}_MODEL`]?.trim();

    // Fallbacks if not set specifically for the role
    if (!provider) {
      if (role === "orchestrator") {
        provider = (process.env.MODEL_PROVIDER || "openai").toLowerCase();
      } else {
        provider = "ollama";
      }
    }

    if (!model) {
      if (role === "orchestrator") {
        model = process.env.MODEL_NAME?.trim() || "gpt-4o-mini";
      } else {
        model = "qwen2.5-coder:1.5b";
      }
    }

    console.log(`\x1b[35m[LLMFactory] Instantiating model for role "${role}": provider="${provider}", model="${model}"\x1b[0m`);

    switch (provider) {
      case "ollama": {
        const baseURL = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434/v1";
        console.log(`[LLMFactory] Connecting to Ollama at ${baseURL} with model "${model || "qwen2.5-coder:1.5b"}"`);
        return new ChatOpenAI({
          model: model || "qwen2.5-coder:1.5b",
          temperature: 0.0,
          apiKey: "ollama",
          configuration: {
            baseURL,
          },
        });
      }
      
      case "openai": {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          throw new Error("OPENAI_API_KEY is not defined in the .env file.");
        }
        return new ChatOpenAI({
          model: model || "gpt-4o-mini",
          temperature: 0.0,
          apiKey,
          maxTokens: 2048
        });
      }

      case "openrouter": {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          throw new Error("OPENROUTER_API_KEY is not defined in the .env file.");
        }
        return new ChatOpenAI({
          model: model || "google/gemma-2-9b-it:free",
          temperature: 0.0,
          apiKey,
          configuration: {
            baseURL: "https://openrouter.ai/api/v1"
          },
          maxTokens: 2048
        });
      }

      case "gemini": {
        return new ChatOpenAI({
          model: "gpt-4o-mini",
          temperature: 0.0,
          apiKey: process.env.OPENAI_API_KEY || "",
        });
      }

      default:
        throw new Error(`Unsupported LLM provider: "${provider}" for role "${role}"`);
    }
  }
}
