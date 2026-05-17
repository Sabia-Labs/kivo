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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("[field-insight] CRITICAL: OPENAI_API_KEY is missing from environment.");
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
  operatorName: Annotation<string>,
  lang: Annotation<string | null>,

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

function getReadyToHelpMessage(lang: string | null | undefined): string {
  const l = lang || "en";
  if (l === "pt") {
    return "Estou pronto para ajudar. Por favor, forneça mais detalhes sobre a sua solicitação para que eu possa coordenar a equipe.";
  }
  if (l === "zh") {
    return "我已经准备好提供帮助。请提供有关您请求的更多详细信息，以便我协调团队。";
  }
  return "I'm ready to help. Please provide more details about your request so I can coordinate the team.";
}

function getNewActivityMessage(lang: string | null | undefined): string {
  const l = lang || "en";
  if (l === "pt") {
    return "Esta parece ser uma nova atividade para nós. Forneça todos os detalhes e eu a atribuirei ao especialista correto.";
  }
  if (l === "zh") {
    return "这似乎是我们需要处理的新型活动。请提供所有详细信息，我会将其分配给合适的专家。";
  }
  return "This seems like a new type of activity for us. Provide all details and I will assign it to the right specialist.";
}

function getNewActivityTitle(lang: string | null | undefined): string {
  const l = lang || "en";
  if (l === "pt") return "Nova Atividade";
  if (l === "zh") return "新活动";
  return "New Activity";
}

function getCapabilityNotFoundMessage(lang: string | null | undefined): string {
  const l = lang || "en";
  if (l === "pt") {
    return "Não consegui encontrar os detalhes da capability selecionada. Por favor, descreva o que você precisa.";
  }
  if (l === "zh") {
    return "我找不到所选功能的详细信息。请描述您需要什么。";
  }
  return "I couldn't find the details for the selected capability. Please describe what you need.";
}

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

  const prompt = `You are a classifier determining the nature of the text entered in a "New Request" details box for a team of autonomous AI agents.
  
  The person interacting with the UI is the Kivo Operator (the manager of the team).
  
  Determine if the following input is a conversational query/greeting directed *from* the Operator *to* the Team Lead (a Simple Question), OR if it is an operational task/work description (which can include copy-pasted customer support tickets, emails, bug reports, feature requests, or external client questions like "Antonio wants to know..."):
  
  Operational Request rules (isSimpleQuestion = false):
  - Any copy-pasted support ticket, bug report, client email, error log, or task instructions.
  - Text describing a problem, a question from an external client (e.g., "Antonio asks if..."), or a request for a feature.
  - Even if the text contains a question, if it is a question *about an issue to be solved by the team*, it is an Operational Request (isSimpleQuestion = false).
  
  Simple Question rules (isSimpleQuestion = true):
  - Direct conversational remarks from the Operator to the Team Lead (e.g., "hello", "hi there", "tell me what the team can do").
  - Questions from the Operator asking about internal status or active tasks (e.g., "how are the active requests doing?", "what is the team mission?").
  
  User Input to classify:
  "${state.requestDetails}"
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

  const prompt = `The Operator (named "${state.operatorName}") asked a simple question or made a conversational remark: "${state.requestDetails}".
  
  Team Context:
  ${state.teamContext}
  
  Respond as the Team Leader. Be helpful, professional and concise. Greet the Operator by their name ("${state.operatorName}") if they are starting a new conversation.
  If they ask for status, use your tools. If they just say hi, say hi back and explain what the team can do.
  Keep it under 3 sentences.
  
  CRITICAL LANGUAGE RULE: 
  - You must write your entire response in the requested language: "${state.lang || "en"}". If "pt", reply in Portuguese. If "zh", reply in Chinese. If "en", reply in English.
  - DO NOT let the language of the Team Context or database logs bias your output. Respond strictly in the requested language ("${state.lang || "en"}").`;

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
      leaderThought: getReadyToHelpMessage(state.lang) 
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
    leaderThought: getNewActivityMessage(state.lang),
    suggestedTitle: result.suggestedTitle || getNewActivityTitle(state.lang)
  };
}

async function evaluateMatchedCapabilityNode(state: typeof FieldInsightState.State) {
  if (!state.matchedCapability) return {};

  const prompt = `You are the Team Leader (Coordinator) talking to the Kivo Operator (named "${state.operatorName}"). Your goal is to advise "${state.operatorName}" on submitting the request to the team.
  
  CRITICAL WORKSPACE RULES:
  - **NEVER** try to execute, solve, answer, or simulate the execution of the task/ticket itself. For example, if the input is a customer ticket, DO NOT write a customer reply or say "Hello Antonio". You are speaking directly to "${state.operatorName}", NOT the client mentioned in the ticket.
  - Address your response exclusively to "${state.operatorName}". Greet them by name in your message!
  - The rhetoric of your response must always be about whether the request is ready to be submitted to the team (e.g. "We matched this to capability X. We have enough details. You can submit now so the team can work on it").
  
  FORMAT RULES:
  - Respond with an extremely short, concise, and direct message (maximum 2-3 sentences).
  - DO NOT use headers, titles, markdown tables, or multiple paragraphs.
  - Return the content as a single unified paragraph that looks like a short, natural chat message.
  - **LANGUAGE RULE**: You must write your entire response in the requested language: "${state.lang || "en"}". If "pt", reply in Portuguese. If "zh", reply in Chinese. If "en", reply in English. DO NOT write in any other language.
  
  Based on the input, we matched the capability: "${state.matchedCapability.name}".
  Input requirements for this capability: "${state.matchedCapability.inputsDescription || "None (Does not require specific inputs)"}".
  The request details input: "${state.requestDetails.trim()}"
  
  Please evaluate under these rules:
  1. If this capability does NOT require inputs:
     - State that we matched this to "${state.matchedCapability.name}", which requires no inputs, and that they can submit the request now so the team can begin.
     - Set "isSufficient" to true.
  2. If this capability requires inputs:
     - Check if the request details contain the required inputs.
     - If sufficient: Reassure the Operator that we have enough details to run "${state.matchedCapability.name}", and they can submit the request now. Set "isSufficient" to true.
     - If missing: Clearly list what required details are missing and guide the Operator to provide them so we can proceed with the submission. Set "isSufficient" to false.
  `;

  const structuredLlm = getLlm().withStructuredOutput(z.object({
    isSufficient: z.boolean(),
    message: z.string().describe(`The Markdown response message to display as Leader thoughts. CRITICAL: You must write this message in the requested language: "${state.lang || "en"}" (if pt write in Portuguese, if zh in Chinese, if en in English).`)
  }));
  const result = await structuredLlm.invoke(prompt);

  return { 
    leaderThought: result.message,
    suggestedCapabilityIdentifier: state.matchedCapability.identifier,
    suggestedTitle: state.matchedCapability.name
  };
}

async function evaluateSelectedCapabilityNode(state: typeof FieldInsightState.State) {
  let cap = null;
  if (state.capabilityIdentifier) {
    cap = await getCapabilityByIdentifier(state.teamId, state.capabilityIdentifier);
  }

  if (!cap) return { leaderThought: getCapabilityNotFoundMessage(state.lang), suggestedCapabilityIdentifier: null };

  const prompt = `You are the Team Leader (Coordinator) talking to the Kivo Operator (named "${state.operatorName}"). Your goal is to advise "${state.operatorName}" on submitting the request to the team.
  
  CRITICAL WORKSPACE RULES:
  - **NEVER** try to execute, solve, answer, or simulate the execution of the task/ticket itself. For example, if the input is a customer ticket, DO NOT write a customer reply or say "Hello Antonio". You are speaking directly to "${state.operatorName}", NOT the client mentioned in the ticket.
  - Address your response exclusively to "${state.operatorName}". Greet them by name in your message!
  - The rhetoric of your response must always be about whether the request is ready to be submitted to the team (e.g. "We have enough details to run this capability. You can submit now so the team can begin").
  
  FORMAT RULES:
  - Respond with an extremely short, concise, and direct message (maximum 2-3 sentences).
  - DO NOT use headers, titles, markdown tables, or multiple paragraphs.
  - Return the content as a single unified paragraph that looks like a short, natural chat message.
  - **LANGUAGE RULE**: You must write your entire response in the requested language: "${state.lang || "en"}". If "pt", reply in Portuguese. If "zh", reply in Chinese. If "en", reply in English. DO NOT write in any other language.
  
  The Operator has selected the capability: "${cap.name}".
  Input requirements for this capability: "${cap.inputsDescription || "None (Does not require specific inputs)"}".
  The request details input: "${state.requestDetails.trim()}"
  
  Please evaluate under these rules:
  1. If this capability does NOT require inputs:
     - State that "${cap.name}" requires no inputs, and that they can submit the request now so the team can begin.
     - Set "isSufficient" to true.
  2. If this capability requires inputs, and the request details is EMPTY:
     - Explain what the capability does and state what inputs we need from them to begin (provide a short inline comma list, DO NOT use bullet points or lists).
     - Set "isSufficient" to false.
  3. If this capability requires inputs, and the request details is NOT empty:
     - Check if the request details contain the required inputs.
     - If sufficient: Reassure the Operator that we have enough details to run "${cap.name}", and they can submit the request now. Set "isSufficient" to true.
     - If missing: Clearly list what required details are missing and guide the Operator to provide them so we can proceed with the submission. Set "isSufficient" to false.
  `;

  const structuredLlm = getLlm().withStructuredOutput(z.object({
    isSufficient: z.boolean(),
    message: z.string().describe(`The Markdown response message to display as Leader thoughts. CRITICAL: You must write this message in the requested language: "${state.lang || "en"}" (if pt write in Portuguese, if zh in Chinese, if en in English).`)
  }));
  const result = await structuredLlm.invoke(prompt);

  return { 
    leaderThought: result.message,
    suggestedCapabilityIdentifier: cap.identifier,
    suggestedTitle: cap.name
  };
}

function routeAfterClassification(state: typeof FieldInsightState.State) {
  if (state.capabilityIdentifier) return "evaluateSelectedCapability";
  if (state.classification?.isSimpleQuestion) return "answerSimpleQuestion";
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

export async function runFieldInsight(teamId: string, requestDetails: string, capabilityIdentifier?: string, operatorName?: string, lang?: string) {
  const result = await fieldInsightWorkflow.invoke({ 
    teamId, 
    requestDetails, 
    capabilityIdentifier: capabilityIdentifier || null,
    operatorName: operatorName || "Operator",
    lang: lang || "en"
  });
  return {
    leaderThought: result.leaderThought,
    suggestedCapabilityIdentifier: result.suggestedCapabilityIdentifier,
    suggestedTitle: result.suggestedTitle
  };
}
