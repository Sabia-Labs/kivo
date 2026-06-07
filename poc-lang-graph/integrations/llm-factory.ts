import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env relative to current location
dotenv.config({ path: path.join(__dirname, "../.env") });

export class LLMFactory {
  /**
   * Instantiates a LangChain Chat Model dynamically based on provider configs in .env
   * @param role 'planner' | 'executor'
   */
  public static createModel(role: "planner" | "executor"): BaseChatModel {
    const roleUpper = role.toUpperCase(); // "PLANNER" or "EXECUTOR"
    
    // Read provider and model name from env (or fallback to defaults)
    const provider = (process.env[`${roleUpper}_PROVIDER`] || "ollama").toLowerCase();
    const model = process.env[`${roleUpper}_MODEL`]?.trim();

    console.log(`\x1b[35m[LLMFactory] Instantiating model for role "${role}": provider="${provider}", model="${model || "(default)"}"\x1b[0m`);

    switch (provider) {
      case "ollama": {
        return new ChatOllama({
          model: model || "qwen2.5-coder:1.5b",
          temperature: 0.0,
          baseUrl: "http://localhost:11434",
          numPredict: 2048
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
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
          throw new Error("GEMINI_API_KEY / GOOGLE_API_KEY is not defined in the .env file.");
        }
        return new ChatGoogleGenerativeAI({
          model: model || "gemini-1.5-flash",
          temperature: 0.0,
          apiKey,
          maxOutputTokens: 2048
        });
      }

      default:
        throw new Error(`Unsupported LLM provider: "${provider}" for role "${role}"`);
    }
  }
}
