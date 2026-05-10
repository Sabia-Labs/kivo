import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import * as dotenv from "dotenv";
import * as path from "path";
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
    dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
    
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
  const capabilitiesSummary = capabilities.map(c => `- ${c.name} (ID: ${c.identifier}): ${c.instructions} (Inputs required: ${c.inputsDescription})`).join("\n");

  return {
    teamContext,
    capabilitiesSummary,
    teamCapabilities: capabilities
  };
}

const classificationSchema = z.object({
  isSimpleQuestion: z.boolean().describe("True if the request is just a simple question (e.g. asking about the team, asking to search the web, a greeting) that doesn't warrant creating a formal operational request.")
});

async function classifyRequestNode(state: typeof FieldInsightState.State) {
  if (state.requestDetails.trim().length < 10) {
    return { classification: { isSimpleQuestion: false } }; // Too short, assume operational/typing
  }

  const prompt = `Based on the following user input, determine if this is just a simple question or conversational greeting, OR if it is an operational request for work to be done.
  
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
  
  Respond as the Team Leader. Be cool, friendly, and concise. 
  If the user asks about the status of requests or tasks, use your tools to check the database and provide an accurate answer based on the returned data.
  Otherwise, give them the answer if you can based on the team context, or a polite generic response. 
  Add a brief encouraging note at the end like: "This one is easy. Even I can answer it right now... But feel free to open up a new request if you need actual work done." or similar.
  Keep it under 3-4 sentences.`;

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
  isNewActivity: z.boolean().describe("Whether this looks like a completely new activity the team hasn't explicitly defined a capability for."),
  suggestedTitle: z.string().optional().nullable().describe("A concise 3-6 word title summarizing the user's request.")
});

async function matchCapabilityNode(state: typeof FieldInsightState.State) {
  if (!state.capabilitiesSummary) {
    return { 
      leaderThought: "This activity is new to the team. We will learn from it. Please make sure to provide all necessary details!" 
    };
  }

  const prompt = `Find the best team capability that fits the user's request, or determine if it's a new activity.
  
  User Request: "${state.requestDetails}"
  
  Current Team Capabilities:
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
    leaderThought: "This activity seems new to the team. We will learn from it! Just ensure you've provided enough details for us to start.",
    suggestedTitle: result.suggestedTitle || null
  };
}

const evaluateInputsSchema = z.object({
  hasSufficientInputs: z.boolean().describe("True if the user provided enough information to fulfill the capability's required inputs."),
  missingInputsMessage: z.string().optional().nullable().describe("If inputs are insufficient, a friendly message asking for the specific missing details."),
  successSummary: z.string().optional().nullable().describe("If inputs are sufficient, a brief encouraging summary of what the team will do."),
  suggestedTitle: z.string().optional().nullable().describe("A concise 3-6 word title summarizing the user's request.")
});

async function evaluateMatchedCapabilityNode(state: typeof FieldInsightState.State) {
  if (!state.matchedCapability) {
    return {}; // Handled by matchCapabilityNode if new activity
  }

  const prompt = `The user wants to use the capability: "${state.matchedCapability.name}".
  Capability Required Inputs: ${state.matchedCapability.inputsDescription || "None specified"}
  
  User Request Details: "${state.requestDetails}"
  
  Evaluate if the user has provided enough information based on the Required Inputs.
  If NOT, write a friendly message (missingInputsMessage) as the Team Leader asking for the specific missing info.
  If YES, write a brief encouraging summary (successSummary) of what will be done.
  Start the message by acknowledging the capability, e.g., "The team knows how to do this. We have a template for '${state.matchedCapability.name}'."
  `;

  const structuredLlm = getLlm().withStructuredOutput(evaluateInputsSchema);
  const result = await structuredLlm.invoke(prompt);

  const thought = result.hasSufficientInputs ? result.successSummary : result.missingInputsMessage;

  return { 
    leaderThought: thought || "",
    suggestedCapabilityIdentifier: state.matchedCapability.identifier,
    suggestedTitle: result.suggestedTitle || state.suggestedTitle || null
  };
}

async function evaluateSelectedCapabilityNode(state: typeof FieldInsightState.State) {
  let cap = null;
  if (state.capabilityIdentifier) {
    cap = await getCapabilityByIdentifier(state.teamId, state.capabilityIdentifier);
  }

  if (!cap) {
    return { leaderThought: "I see you selected a capability, but I couldn't find its details. Please provide as much context as possible." };
  }

  const prompt = `The user selected the capability: "${cap.name}".
  Capability Required Inputs: ${cap.inputsDescription || "None specified"}
  
  User Request Details: "${state.requestDetails}"
  
  Evaluate if the user has provided enough information based on the Required Inputs.
  If NOT, write a friendly message (missingInputsMessage) as the Team Leader asking for the specific missing info.
  If YES, write a brief encouraging summary (successSummary) of what will be done.
  `;

  const structuredLlm = getLlm().withStructuredOutput(evaluateInputsSchema);
  const result = await structuredLlm.invoke(prompt);

  const thought = result.hasSufficientInputs ? result.successSummary : result.missingInputsMessage;

  return { 
    leaderThought: thought || "Looks good to me.",
    suggestedTitle: result.suggestedTitle || null,
    suggestedCapabilityIdentifier: cap.identifier
  };
}

function routeAfterClassification(state: typeof FieldInsightState.State) {
  if (state.classification?.isSimpleQuestion) {
    return "answerSimpleQuestion";
  }
  if (state.capabilityIdentifier) {
    return "evaluateSelectedCapability";
  }
  return "matchCapability";
}

function routeAfterMatchCapability(state: typeof FieldInsightState.State) {
  if (state.matchedCapability) {
    return "evaluateMatchedCapability";
  }
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
