import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { getTeamById } from "../controllers/teamsController";
import { getCapabilitiesByTeam, getCapabilityByIdentifier } from "../controllers/capabilitiesController";
import { getAgentsByTeam } from "../controllers/agentsController";
import { db } from "../db/client";
import { requests, tasks } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { tool } from "@langchain/core/tools";
// @ts-ignore
import { createReactAgent } from "@langchain/langgraph/prebuilt";

let llmInstance: ChatOpenAI | null = null;
function getLlm() {
  if (!llmInstance) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.PLATFORM_OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("[field-insight] CRITICAL: Both OPENAI_API_KEY and PLATFORM_OPENAI_API_KEY are missing from environment.");
    }

    llmInstance = new ChatOpenAI({ 
      modelName: "gpt-4o", 
      temperature: 0,
      apiKey: apiKey 
    });
  }
  return llmInstance;
}

const FieldInsightState = Annotation.Root({
  teamId: Annotation<string>,
  requestDetails: Annotation<string>,
  capabilityIdentifier: Annotation<string | null>,

  teamContext: Annotation<string>,
  capabilitiesSummary: Annotation<string>,
  teamCapabilities: Annotation<any[]>,

  classification: Annotation<{
    isSimpleQuestion: boolean;
  }>,

  matchedCapability: Annotation<any | null>,
  
  leaderThought: Annotation<string>,
  suggestedCapabilityIdentifier: Annotation<string | null>,
  suggestedTitle: Annotation<string | null>
});

async function fetchContextsNode(state: typeof FieldInsightState.State) {
  const team = await getTeamById(state.teamId);
  if (!team) throw new Error("Team not found");

  const teamAgents = await getAgentsByTeam(state.teamId);
  const teamContext = `Team Name: ${team.name}\nMission: ${team.mission}\nAgents:\n${teamAgents.map(a => `- ${a.name} (Role: ${a.roleId})`).join("\n")}`;

  const capabilities = await getCapabilitiesByTeam(state.teamId);
  // Filter out capabilities that don't have instructions yet
  const validCaps = capabilities.filter(c => c.instructions);
  const capabilitiesSummary = validCaps.map(c => `- ${c.name} (ID: ${c.identifier}): ${c.instructions} (Inputs required: ${c.inputsDescription || 'None'})`).join("\n");

  return {
    teamContext,
    capabilitiesSummary,
    teamCapabilities: capabilities
  };
}

const classificationSchema = z.object({
  isSimpleQuestion: z.boolean().describe("True if the request is just a simple question (e.g. asking about the team, status of tasks, general info) that doesn't warrant creating a formal operational request.")
});

async function classifyRequestNode(state: typeof FieldInsightState.State) {
  if (state.requestDetails.trim().length < 5) {
    return { classification: { isSimpleQuestion: true } }; // Too short, treat as greeting/noise
  }

  const prompt = `Based on the following user input, determine if this is just a simple question, greeting, or status check OR if it is an operational request for work to be done.
  
  User input: "${state.requestDetails}"
  `;

  const structuredLlm = getLlm().withStructuredOutput(classificationSchema);
  const result = await structuredLlm.invoke(prompt);

  return { classification: result };
}

async function answerSimpleQuestionNode(state: typeof FieldInsightState.State) {
  const getRequestsTool = tool(
    async ({ status }) => {
      const conditions: any[] = [eq(requests.teamId, state.teamId)];
      if (status) conditions.push(eq(requests.status, status as any));
      
      const rows = await db.query.requests.findMany({
        where: and(...conditions),
        orderBy: (reqs, { desc }) => [desc(reqs.createdAt)],
        limit: 10
      });
      return JSON.stringify(rows, null, 2);
    },
    {
      name: "get_team_requests",
      description: "Use to search and get the list of active requests for the team. Returns JSON.",
      schema: z.object({ 
        status: z.enum(["draft", "open", "in_progress", "waiting_user", "completed", "cancelled"]).optional().describe("Filter by request status") 
      })
    }
  );

  const getTasksTool = tool(
    async ({ status }) => {
      const conditions: any[] = [eq(tasks.teamId, state.teamId)];
      if (status) conditions.push(eq(tasks.status, status as any));
      
      const rows = await db.query.tasks.findMany({
        where: and(...conditions),
        orderBy: (tsks, { desc }) => [desc(tsks.createdAt)],
        limit: 10
      });
      return JSON.stringify(rows, null, 2);
    },
    {
      name: "get_team_tasks",
      description: "Use to search and get the list of active tasks for the team. Returns JSON.",
      schema: z.object({ 
        status: z.enum(["open", "in_progress", "waiting_user", "completed", "cancelled"]).optional().describe("Filter by task status") 
      })
    }
  );

  const prompt = `The user asked a simple question or made a conversational remark: "${state.requestDetails}".
  
  Team Context:
  ${state.teamContext}
  
  Respond as the Team Leader. Be helpful, professional and concise. 
  If they ask for status, use your tools. If they just say hi, say hi back and explain what the team can do.
  Keep it under 3 sentences.`;

  const agent = createReactAgent({
    llm: getLlm(),
    tools: [getRequestsTool, getTasksTool],
    messageModifier: prompt,
  });

  const response = await agent.invoke({
    messages: [{ role: "user", content: state.requestDetails }]
  });

  const finalMessage = response.messages[response.messages.length - 1];
  return { leaderThought: finalMessage.content as string, suggestedTitle: "General Inquiry" };
}

const capabilityMatchSchema = z.object({
  matchedCapabilityIdentifier: z.string().optional().nullable().describe("The identifier of the matched capability from the list, if any."),
  suggestedTitle: z.string().optional().nullable().describe("A concise title for the request.")
});

async function matchCapabilityNode(state: typeof FieldInsightState.State) {
  if (!state.capabilitiesSummary || state.capabilitiesSummary.length < 10) {
    return { 
      leaderThought: "I'm ready to help. Please provide more details about your request so I can coordinate the team." 
    };
  }

  const prompt = `Find the best team capability for: "${state.requestDetails}"
  
  Available Capabilities:
  ${state.capabilitiesSummary}
  `;

  const structuredLlm = getLlm().withStructuredOutput(capabilityMatchSchema);
  const result = await structuredLlm.invoke(prompt);

  if (result.matchedCapabilityIdentifier) {
    const matched = state.teamCapabilities.find(c => c.identifier === result.matchedCapabilityIdentifier);
    if (matched) {
      return { matchedCapability: matched, suggestedTitle: result.suggestedTitle || null };
    }
  }

  return { 
    leaderThought: "This seems like a new type of activity for us. Provide all details and I will assign it to the right specialist.",
    suggestedTitle: result.suggestedTitle || null
  };
}

async function evaluateMatchedCapabilityNode(state: typeof FieldInsightState.State) {
  if (!state.matchedCapability) return {};

  const prompt = `The user wants to use: "${state.matchedCapability.name}".
  Needs: ${state.matchedCapability.inputsDescription || "General context"}
  
  Input: "${state.requestDetails}"
  
  Evaluate if the input is sufficient. If not, ask for what's missing. If yes, summarize the plan. 
  Respond as a Team Leader.`;

  const structuredLlm = getLlm().withStructuredOutput(z.object({
    isSufficient: z.boolean(),
    message: z.string()
  }));
  const result = await structuredLlm.invoke(prompt);

  return { 
    leaderThought: result.message,
    suggestedCapabilityIdentifier: state.matchedCapability.identifier
  };
}

async function evaluateSelectedCapabilityNode(state: typeof FieldInsightState.State) {
  let cap = null;
  if (state.capabilityIdentifier) {
    cap = await getCapabilityByIdentifier(state.teamId, state.capabilityIdentifier);
  }

  if (!cap) return { leaderThought: "I couldn't find the details for the selected capability. Please describe what you need." };

  const prompt = `The user selected: "${cap.name}".
  Needs: ${cap.inputsDescription || "General context"}
  Input: "${state.requestDetails}"
  
  Evaluate and respond as Team Leader.`;

  const structuredLlm = getLlm().withStructuredOutput(z.object({
    message: z.string()
  }));
  const result = await structuredLlm.invoke(prompt);

  return { 
    leaderThought: result.message,
    suggestedCapabilityIdentifier: cap.identifier
  };
}

function routeAfterClassification(state: typeof FieldInsightState.State) {
  if (state.classification?.isSimpleQuestion) return "answerSimpleQuestion";
  if (state.capabilityIdentifier) return "evaluateSelectedCapability";
  return "matchCapability";
}

function routeAfterMatchCapability(state: typeof FieldInsightState.State) {
  if (state.matchedCapability) return "evaluateMatchedCapability";
  return END;
}

const workflow = new StateGraph(FieldInsightState)
  .addNode("fetchContexts", fetchContextsNode)
  .addNode("classifyRequest", classifyRequestNode)
  .addNode("answerSimpleQuestion", answerSimpleQuestionNode)
  .addNode("evaluateSelectedCapability", evaluateSelectedCapabilityNode)
  .addNode("matchCapability", matchCapabilityNode)
  .addNode("evaluateMatchedCapability", evaluateMatchedCapabilityNode)
  .addEdge(START, "fetchContexts")
  .addEdge("fetchContexts", "classifyRequest")
  .addConditionalEdges("classifyRequest", routeAfterClassification)
  .addEdge("answerSimpleQuestion", END)
  .addEdge("evaluateSelectedCapability", END)
  .addConditionalEdges("matchCapability", routeAfterMatchCapability)
  .addEdge("evaluateMatchedCapability", END);

export const fieldInsightWorkflow = workflow.compile();

export async function runFieldInsight(teamId: string, requestDetails: string, capabilityIdentifier?: string) {
  const result = await fieldInsightWorkflow.invoke({ teamId, requestDetails, capabilityIdentifier: capabilityIdentifier || null });
  return {
    leaderThought: result.leaderThought,
    suggestedCapabilityIdentifier: result.suggestedCapabilityIdentifier,
    suggestedTitle: result.suggestedTitle
  };
}
