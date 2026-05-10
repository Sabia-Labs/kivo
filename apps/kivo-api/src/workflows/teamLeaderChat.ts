import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { db } from "../db/client";
import { agents, leaderChatHistory } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import * as dotenv from "dotenv";
import * as path from "path";

let llmInstance: ChatOpenAI | null = null;
function getLlm() {
  if (!llmInstance) {
    dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
    
    const apiKey = process.env.OPENAI_API_KEY || process.env.PLATFORM_OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("[team-leader-chat] CRITICAL: Missing OpenAI API Key");
    }

    llmInstance = new ChatOpenAI({ 
      modelName: "gpt-4o", 
      temperature: 0.7,
      apiKey: apiKey 
    });
  }
  return llmInstance;
}

const ChatState = Annotation.Root({
  teamId: Annotation<string>,
  userId: Annotation<string>,
  userMessage: Annotation<string>,

  // Computed state
  leaderAgent: Annotation<any>,
  systemPrompt: Annotation<string>,
  chatHistory: Annotation<any[]>,
  leaderResponse: Annotation<string>,
  summary: Annotation<string>,
});

async function fetchContextNode(state: typeof ChatState.State) {
  // 1. Fetch the Team Leader agent
  const allAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.teamId, state.teamId));

  const leader = allAgents.find(a => a.roleId?.includes("lead") || a.roleId?.includes("manager") || a.roleId === "executive-assistant");

  if (!leader) {
    throw new Error("Team Leader not found for this team");
  }


  // 2. Fetch Chat History (last 10 messages)
  const history = await db
    .select()
    .from(leaderChatHistory)
    .where(and(eq(leaderChatHistory.teamId, state.teamId), eq(leaderChatHistory.userId, state.userId)))
    .orderBy(desc(leaderChatHistory.createdAt))
    .limit(10);

  // Reverse so chronological
  history.reverse();

  // 3. Build the system prompt
  const parts = [];
  if (leader.identity) parts.push(`[IDENTITY]\n${leader.identity}`);
  if (leader.soul) parts.push(`[SOUL]\n${leader.soul}`);
  if (leader.agentsInstructions) parts.push(`[INSTRUCTIONS]\n${leader.agentsInstructions}`);
  if (leader.userContext) parts.push(`[USER CONTEXT]\n${leader.userContext}`);
  if (leader.memory) parts.push(`[MEMORY]\n${leader.memory}`);
  if (leader.toolsNotes) parts.push(`[TOOLS]\n${leader.toolsNotes}`);

  const hasTelegramToken = Boolean((leader.metadata as any)?.telegramBotToken);

  let systemPrompt = parts.join("\n\n");
  systemPrompt += `\n\n[CRITICAL ONBOARDING RULES]
- You are the Team Leader, chatting directly with the user via a small widget on the team's dashboard screen.
- If this seems to be the first time the user is interacting with you (no or very little chat history), you MUST enthusiastically welcome them to the Kivo platform and offer a walkthrough of what your team can do.
- You MUST remind the user that it is much better to talk through Telegram or WeChat.
- Offer Telegram integration: Tell them to search for @BotFather on Telegram, send /newbot, choose a name ending in 'bot', and then paste the bot token here in this chat box (via the Telegram integration UI).
- If they already have Telegram configured (hasTelegramToken=${hasTelegramToken}), do not ask them to configure it again unless they specifically want to update it.`;

  return { leaderAgent: leader, chatHistory: history, systemPrompt };
}

async function generateResponseNode(state: typeof ChatState.State) {
  const messages: BaseMessage[] = [new SystemMessage(state.systemPrompt)];
  
  for (const msg of state.chatHistory) {
    if (msg.role === "user") {
      messages.push(new HumanMessage(msg.message));
    } else {
      messages.push(new AIMessage(msg.message));
    }
  }

  // Add the current user message
  messages.push(new HumanMessage(state.userMessage));

  const response = await getLlm().invoke(messages);
  const aiMessage = response.content as string;

  return { leaderResponse: aiMessage };
}

async function updateMemoryNode(state: typeof ChatState.State) {
  // If we had a long conversation, summarize it into dailyLogs
  // For simplicity, we just summarize the latest interaction or append a quick summary
  const summaryPrompt = `Summarize the following brief interaction between the user and the team leader in 1-2 sentences. Focus on what was learned about the user, their goals, or any decisions made.
  User: ${state.userMessage}
  Leader: ${state.leaderResponse}
  `;
  
  const response = await getLlm().invoke(summaryPrompt);
  const summary = response.content as string;

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  
  const currentLogs = (state.leaderAgent.dailyLogs as Record<string, string>) || {};
  const currentTodayLog = currentLogs[today] || "";
  
  const newTodayLog = currentTodayLog 
    ? `${currentTodayLog}\n[${new Date().toISOString()}] ${summary}` 
    : `[${new Date().toISOString()}] ${summary}`;
  
  const updatedLogs = { ...currentLogs, [today]: newTodayLog };

  await db
    .update(agents)
    .set({ dailyLogs: updatedLogs })
    .where(eq(agents.id, state.leaderAgent.id));

  return { summary };
}

const workflow = new StateGraph(ChatState)
  .addNode("fetchContext", fetchContextNode)
  .addNode("generateResponse", generateResponseNode)
  .addNode("updateMemory", updateMemoryNode)
  .addEdge(START, "fetchContext")
  .addEdge("fetchContext", "generateResponse")
  .addEdge("generateResponse", "updateMemory")
  .addEdge("updateMemory", END);

export const teamLeaderChatWorkflow = workflow.compile();

export async function runTeamLeaderChat(teamId: string, userId: string, userMessage: string) {
  const result = await teamLeaderChatWorkflow.invoke({ teamId, userId, userMessage });
  return result.leaderResponse;
}
