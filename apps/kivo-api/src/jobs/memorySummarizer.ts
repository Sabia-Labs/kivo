import { db } from "../db/client";
import { agents, teams } from "../db/schema";
import { eq } from "drizzle-orm";
import { LLMFactory } from "../workflows/langgraph/integrations/llm-factory";
import { z } from "zod";

const MAX_MEMORY_LENGTH = 2000;

export async function summarizeMemories() {
  console.log(`[memory-summarizer] Starting memory summarization job...`);

  try {
    // 1. Summarize Agent Memories
    const allAgents = await db.select().from(agents);
    for (const agent of allAgents) {
      if (agent.longTermMemory && agent.longTermMemory.length > MAX_MEMORY_LENGTH) {
        console.log(`[memory-summarizer] Summarizing long-term memory for agent ${agent.id}`);
        const summarizedText = await invokeSummarizerLLM(agent.longTermMemory, "agent");
        if (summarizedText) {
          await db.update(agents)
            .set({ longTermMemory: summarizedText, updatedAt: new Date() })
            .where(eq(agents.id, agent.id));
        }
      }
    }

    // 2. Summarize Team Memories
    const allTeams = await db.select().from(teams);
    for (const team of allTeams) {
      if (team.longTermMemory && team.longTermMemory.length > MAX_MEMORY_LENGTH) {
        console.log(`[memory-summarizer] Summarizing long-term memory for team ${team.id}`);
        const summarizedText = await invokeSummarizerLLM(team.longTermMemory, "team");
        if (summarizedText) {
          await db.update(teams)
            .set({ longTermMemory: summarizedText, updatedAt: new Date() })
            .where(eq(teams.id, team.id));
        }
      }
    }

    console.log(`[memory-summarizer] Memory summarization job completed.`);
  } catch (err) {
    console.error(`[memory-summarizer] Job failed:`, err);
  }
}

async function invokeSummarizerLLM(rawMemory: string, target: "agent" | "team"): Promise<string | null> {
  const llm = LLMFactory.createModel("orchestrator");
  
  const schema = z.object({
    summarizedMemory: z.string().describe("A condensed, highly dense summary of the long-term memory, retaining all absolute rules, facts, and essential knowledge. Maximum 1500 characters. Keep date timestamps if they imply an important chronological order, otherwise discard them to save space.")
  });

  const structuredLlm = llm.withStructuredOutput(schema);
  
  const context = target === "agent" 
    ? "This memory belongs to a specific AI developer agent. It contains their identity traits, preferences, and personal rules."
    : "This memory belongs to a team of AI developers. It contains shared team guidelines, architectural rules, and collective knowledge.";

  const prompt = `You are a Memory Condenser. Your task is to summarize the following long-term memory string.
${context}

RULES:
1. Merge duplicate or similar instructions.
2. Remove conversational fluff.
3. Keep the most critical facts, rules, and preferences.
4. Output must be a dense markdown list.
5. Limit to maximum 1500 characters.

RAW MEMORY:
${rawMemory}
`;

  try {
    const result = await structuredLlm.invoke(prompt);
    return result.summarizedMemory;
  } catch (err) {
    console.error(`[memory-summarizer] Failed to invoke LLM:`, err);
    return null;
  }
}
