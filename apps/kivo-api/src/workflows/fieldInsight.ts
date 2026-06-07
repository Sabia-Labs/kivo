import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { getTeamById } from "../controllers/teamsController";
import { getCapabilitiesByTeam, getCapabilityByIdentifier } from "../controllers/capabilitiesController";
import { getAgentsByTeam } from "../controllers/agentsController";
import { db } from "../db/client";
import { requests, tasks, integrations } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { LLMFactory } from "./langgraph/integrations/llm-factory";
import { ConnectorFactory } from "./langgraph/integrations/factory";

function getLlm(): any {
  return LLMFactory.createModel("orchestrator");
}

// ==========================================
// REUSABLE & EXPORTED HELPER FUNCTIONS
// ==========================================

const queryClassificationSchema = z.object({
  category: z.enum(["kivo", "external_integration", "web_search", "conversational"])
    .describe("The category of the user's inquiry: 'kivo' for Kivo requests/tasks/agents/capabilities, 'external_integration' for Linear/Jira/Notion tickets/kb, 'web_search' for general web queries, or 'conversational' for simple chitchat/sky is blue/greetings."),
  ticketId: z.string().nullable().optional()
    .describe("An extracted ticket, request, or issue ID found in the text, e.g. 'KVO-110' or 'SRE-5'."),
  searchQuery: z.string().nullable().optional()
    .describe("Search keywords to look up in the knowledge base or web search if the query demands it."),
  isSimpleQuestion: z.boolean()
    .describe("True if the query is a conversational question, greeting, or status request. False if it is a formal description of a task/ticket to be executed/created as a new operational request.")
});

/**
 * Classifies an operator query or message to identify its category, extracted ticket IDs, search query keywords,
 * and whether it's a simple query vs. an operational task description.
 */
export async function classifyOperatorQuery(requestDetails: string): Promise<z.infer<typeof queryClassificationSchema>> {
  if (requestDetails.trim().length < 5) {
    return { category: "conversational", ticketId: null, searchQuery: null, isSimpleQuestion: true };
  }

  const prompt = `You are an intent classifier for an AI agent team assistant.
Classify the user's input into ONE category and determine if it is a question or a task.

== CATEGORIES ==

"kivo"
  The user is asking about THIS TEAM's internal data: their requests, tasks, agents, capabilities, or team status.
  Examples: "how are the tasks?", "who are the agents?", "what does request SRE-5 do?", "show active requests"

"external_integration"
  The user is asking about a SPECIFIC ticket or document in an external system (Linear, Jira, GitHub, Notion)
  AND the question is clearly about that team's work context.
  Examples: "what's the status of KVO-110 in Linear?", "is there a doc about deploy in Notion?"
  NOT this category: general knowledge, trivia, lists of famous things, or anything unrelated to the team's work.

"web_search"
  The user wants general knowledge that is NOT about this team and NOT in an external ticketing system.
  Examples: "biggest tech companies", "how to install docker", "dollar exchange rate", "who won the 2022 World Cup"
  IMPORTANT: Any question asking to LIST, NAME, or DESCRIBE well-known things in the world = "web_search".
  "list the 3 biggest tech companies" = web_search (even though it uses 'list')

"conversational"
  Greetings, chitchat, or very short casual messages.
  Examples: "hello", "good morning", "thanks", "why is the sky blue?"

== isSimpleQuestion ==

true  = The user is ASKING or INQUIRING (a question, a greeting, a status check, a request for information).
        Commands like "list X", "show me X", "tell me X" are QUESTIONS (true), not team tasks.
false = The user is SUBMITTING WORK to be executed by the team (a bug report, a ticket, a task to perform).
        These are typically copy-pasted emails, detailed descriptions of a problem to fix, or explicit work orders.

== EXAMPLES ==

Input: "qual o nome das maiores empresas de tech do mundo?"
-> category: "web_search", isSimpleQuestion: true

Input: "liste as 3 maiores empresas de tecnologia"
-> category: "web_search", isSimpleQuestion: true  ("liste" here = asking for information, not a team task)

Input: "como estao as tarefas do time?"
-> category: "kivo", isSimpleQuestion: true

Input: "qual o status do ticket KVO-110 no Linear?"
-> category: "external_integration", isSimpleQuestion: true, ticketId: "KVO-110"

Input: "bom dia!"
-> category: "conversational", isSimpleQuestion: true

Input: "deploy the staging environment for version 2.1"
-> category: "kivo", isSimpleQuestion: false

Input: "[copy-paste of a customer bug report email]"
-> category: "kivo", isSimpleQuestion: false

Input: "read ticket KVO-110 from Linear and summarize it"
-> category: "external_integration", isSimpleQuestion: false, ticketId: "KVO-110"

== NOW CLASSIFY ==
User input: "${requestDetails}"`;

  const structuredLlm = getLlm().withStructuredOutput(queryClassificationSchema);
  return await structuredLlm.invoke(prompt);
}

/**
 * Fetches relevant team context from the internal Kivo database.
 */
export async function fetchKivoContext(teamId: string, ticketId?: string | null | undefined): Promise<string> {
  const team = await getTeamById(teamId);
  if (!team) return "Team not found.";

  const teamAgents = await getAgentsByTeam(teamId);
  const capabilities = await getCapabilitiesByTeam(teamId);
  
  let resultContext = `Team Name: ${team.name}\nMission: ${team.mission}\n`;
  resultContext += `Agents in team:\n${teamAgents.map(a => `- ${a.name} (Role: ${a.roleId}, Leader: ${a.isLeader})`).join("\n")}\n`;
  resultContext += `Available Capabilities:\n${capabilities.filter(c => c.instructions).map(c => {
    const firstLine = c.instructions.split("\n").map(l => l.trim()).filter(Boolean)[0] || "Executes team tasks.";
    return `- ${c.name} (${c.identifier}): ${firstLine}`;
  }).join("\n")}\n`;

  if (ticketId) {
    const req = await db.query.requests.findFirst({
      where: and(eq(requests.teamId, teamId), eq(requests.identifier, ticketId.toUpperCase()))
    });
    if (req) {
      resultContext += `\nFound Specific Request [${req.identifier}]:\n- Title: "${req.title}"\n- Status: "${req.status}"\n- Details: "${req.requestDetails || ''}"\n- Created: ${req.createdAt.toISOString()}\n`;
      
      const reqTasks = await db.query.tasks.findMany({
        where: and(eq(tasks.teamId, teamId), eq(tasks.requestId, req.id))
      });
      if (reqTasks.length > 0) {
        resultContext += `Associated Tasks:\n${reqTasks.map(t => `- Task: "${t.title}" (Status: "${t.status}")`).join("\n")}\n`;
      } else {
        resultContext += `No tasks created for this request yet.\n`;
      }
      return resultContext;
    }
  }

  const activeRequests = await db.query.requests.findMany({
    where: eq(requests.teamId, teamId),
    orderBy: (reqs, { desc }) => [desc(reqs.createdAt)],
    limit: 5
  });

  const activeTasks = await db.query.tasks.findMany({
    where: eq(tasks.teamId, teamId),
    orderBy: (tsks, { desc }) => [desc(tsks.createdAt)],
    limit: 5
  });

  resultContext += `\nRecent Requests:\n${activeRequests.map(r => `- Request ${r.identifier} (Title: "${r.title}", Status: "${r.status}", Created: ${r.createdAt.toISOString()})`).join("\n")}\n`;
  resultContext += `Recent Tasks:\n${activeTasks.map(t => `- Task "${t.title}" (Status: "${t.status}", Created: ${t.createdAt.toISOString()})`).join("\n")}\n`;

  return resultContext;
}

/**
 * Fetches relevant context from configured external integrations (Linear, Notion, etc.).
 */
export async function fetchExternalContext(teamId: string, ticketId?: string | null | undefined, searchQuery?: string | null | undefined): Promise<string> {
  const teamIntegrations = await db.select().from(integrations).where(eq(integrations.teamId, teamId));
  if (teamIntegrations.length === 0) {
    return "No external integrations configured for this team.";
  }

  const connectorAdapters: Record<string, any> = {};
  for (const integ of teamIntegrations) {
    let roleKey = integ.role ? integ.role.toLowerCase().replace(/\s+/g, "_") : "";
    if (roleKey.includes("ticket")) roleKey = "ticketing";
    else if (roleKey.includes("knowledge") || roleKey.includes("documentation") || roleKey.includes("kb")) roleKey = "knowledge_base";
    else if (roleKey.includes("project")) roleKey = "project";

    if (!roleKey) continue;

    const adapter = ConnectorFactory.createAdapter(integ.provider, {
      ...(integ.metadata as any || {}),
      apiKey: integ.apiKey,
    });
    if (adapter) {
      connectorAdapters[roleKey] = adapter;
    }
  }

  let resultContext = "";

  if (ticketId && connectorAdapters["ticketing"]) {
    try {
      console.log(`[fetchExternalContext] Querying ticket details for: ${ticketId}`);
      const ticket = await connectorAdapters["ticketing"].getTicketDetails(ticketId);
      resultContext += `Ticket Details [${ticketId}]:\n${typeof ticket === "string" ? ticket : JSON.stringify(ticket)}\n`;
    } catch (err: any) {
      resultContext += `Failed to retrieve ticket ${ticketId} details: ${err.message || err}\n`;
    }
  }

  if (searchQuery && connectorAdapters["knowledge_base"]) {
    try {
      console.log(`[fetchExternalContext] Searching knowledge base for: ${searchQuery}`);
      const kbResults = await connectorAdapters["knowledge_base"].search(searchQuery);
      resultContext += `Knowledge Base search results for "${searchQuery}":\n${typeof kbResults === "string" ? kbResults : JSON.stringify(kbResults)}\n`;
    } catch (err: any) {
      resultContext += `Failed to query knowledge base: ${err.message || err}\n`;
    }
  }

  if (searchQuery && connectorAdapters["ticketing"]) {
    try {
      console.log(`[fetchExternalContext] Searching tickets for query: ${searchQuery}`);
      const searchResults = await connectorAdapters["ticketing"].searchTickets(undefined, ["Backlog", "Todo", "In Progress"]);
      resultContext += `Linear ticket backlog context:\n${typeof searchResults === "string" ? searchResults : JSON.stringify(searchResults)}\n`;
    } catch (err: any) {
      // Ignored
    }
  }

  return resultContext || "No matching data found in external integrations.";
}

/**
 * Handles web search requests (currently mock/fallback due to environment constraints).
 */
export async function fetchWebSearchContext(searchQuery?: string | null | undefined): Promise<string> {
  if (!searchQuery) return "No query provided for web search.";
  return `Web search query was: "${searchQuery}". Web search API is not configured on this environment. Please rely on your pre-trained knowledge to answer, or note this limitation politely if details cannot be known without live data.`;
}

// ==========================================
// LANGGRAPH WORKFLOW STATE & SCHEMAS
// ==========================================

const FieldInsightState = Annotation.Root({
  teamId: Annotation<string>,
  requestDetails: Annotation<string>,
  capabilityIdentifier: Annotation<string | null>,
  operatorName: Annotation<string>,
  lang: Annotation<string | null>,

  teamContext: Annotation<string>,
  capabilitiesSummary: Annotation<string>,
  teamCapabilities: Annotation<any[]>,

  classification: Annotation<z.infer<typeof queryClassificationSchema>>,
  retrievedContext: Annotation<string | null>,

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
    return "Esta parece ser uma nova atividade para o nosso time! Não temos uma receita pronta para isso ainda, mas você pode submeter assim mesmo — o time aprenderá com ela e vai se tornar mais capaz.";
  }
  if (l === "zh") {
    return "这似乎是我们团队的一项新活动！我们还没有现成的流程，但您可以直接提交——团队将从中学习并不断成长。";
  }
  return "This looks like a new type of activity for our team! We don't have a ready-made process for it yet, but you can submit it anyway — the team will learn from it and grow more capable.";
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

/**
 * Resolves the effective inputsDescription for a capability.
 * For `workflow` type capabilities that have no own inputsDescription,
 * the required inputs are those of the FIRST task in the workflow —
 * i.e., what is needed to START the flow. This avoids duplicating
 * input declarations across workflow and task definition files.
 */
async function resolveInputsDescription(cap: any, teamId: string): Promise<string> {
  const own = (cap.inputsDescription || "").trim();
  if (own.length > 0) return own;

  if (cap.type === "workflow" && Array.isArray(cap.tasksWorkflow) && cap.tasksWorkflow.length > 0) {
    const firstTaskIdentifier = cap.tasksWorkflow[0] as string;
    const firstTask = await getCapabilityByIdentifier(teamId, firstTaskIdentifier);
    return (firstTask?.inputsDescription || "").trim();
  }

  return "";
}

// ==========================================
// BEAUTIFUL LOGGER HELPERS FOR FIELD INSIGHTS
// ==========================================
function logHeader(title: string, colorCode: string = "35", icon: string = "🚀") {
  const line = "═".repeat(60);
  console.log(`\n\x1b[1;${colorCode}m╔${line}╗\x1b[0m`);
  console.log(`\x1b[1;${colorCode}m║ ${icon} ${title.padEnd(55)} ║\x1b[0m`);
  console.log(`\x1b[1;${colorCode}m╚${line}╝\x1b[0m`);
}

function logSection(title: string, content: any, colorCode: string = "36") {
  console.log(`\n\x1b[1;${colorCode}m▶ ${title}\x1b[0m`);
  if (typeof content === "string") {
    console.log(content.split("\n").map(l => `  ${l}`).join("\n"));
  } else {
    console.log(JSON.stringify(content, null, 2).split("\n").map(l => `  ${l}`).join("\n"));
  }
}

function logState(label: string, state: any) {
  console.log(`\n\x1b[1;35m[STATE] ${label} ──────────────────────────────────────────────────\x1b[0m`);
  const snapshot = {
    teamId: state.teamId,
    requestDetails: state.requestDetails && state.requestDetails.length > 100 ? state.requestDetails.substring(0, 100) + "..." : state.requestDetails,
    capabilityIdentifier: state.capabilityIdentifier,
    lang: state.lang,
    classification: state.classification,
    retrievedContext: state.retrievedContext && state.retrievedContext.length > 150 ? state.retrievedContext.substring(0, 150) + "..." : state.retrievedContext,
    matchedCapability: state.matchedCapability ? state.matchedCapability.identifier : null,
    suggestedCapabilityIdentifier: state.suggestedCapabilityIdentifier,
    suggestedTitle: state.suggestedTitle
  };
  console.log(`\x1b[37m${JSON.stringify(snapshot, null, 2)}\x1b[0m`);
  console.log(`\x1b[1;35m──────────────────────────────────────────────────────────────────\x1b[0m`);
}

function logPrompt(type: string, system: string, user: string) {
  console.log(`\n\x1b[1;35m[PROMPT: ${type}] ──────────────────────────────────────────────────\x1b[0m`);
  console.log(`\x1b[1;34mSystem:\x1b[0m\n\x1b[37m${system.trim()}\x1b[0m`);
  console.log(`\x1b[1;34mUser:\x1b[0m\n\x1b[37m${user.trim()}\x1b[0m`);
  console.log(`\x1b[1;35m──────────────────────────────────────────────────────────────────\x1b[0m`);
}

// ==========================================
// WORKFLOW NODES
// ==========================================
async function fetchContextsNode(state: typeof FieldInsightState.State) {
  logHeader("FIELD INSIGHTS: FETCH CONTEXTS", "33", "📋");
  logState("ENTRY", state);

  const team = await getTeamById(state.teamId);
  if (!team) throw new Error("Team not found");

  const teamAgents = await getAgentsByTeam(state.teamId);
  const teamContext = `Team Name: ${team.name}\nMission: ${team.mission}\nAgents:\n${teamAgents.map(a => `- ${a.name} (Role: ${a.roleId})`).join("\n")}`;

  const capabilities = await getCapabilitiesByTeam(state.teamId);
  const validCaps = capabilities.filter(c => c.instructions);
  const capabilitiesSummary = validCaps.map(c => {
    const firstLine = c.instructions.split("\n").map(l => l.trim()).filter(Boolean)[0] || "Executes team tasks.";
    return `- ${c.name} (ID: ${c.identifier}): ${firstLine} (Inputs required: ${c.inputsDescription || 'None'})`;
  }).join("\n");

  const update = {
    teamContext,
    capabilitiesSummary,
    teamCapabilities: capabilities
  };
  logState("EXIT", { ...state, ...update });
  return update;
}

// ==========================================
// NODE: CLASSIFY REQUEST
// Small focused prompt — NO capabilities list shown here.
// Seeing capabilities biases small models toward ticket-related hallucinations.
// ==========================================
async function classifyRequestNode(state: typeof FieldInsightState.State) {
  logHeader("FIELD INSIGHTS: CLASSIFY REQUEST", "35", "🔍");
  logState("ENTRY", state);

  const classification = await classifyOperatorQuery(state.requestDetails);

  logSection("🔖 Classification Result", classification);

  const update = { classification };
  logState("EXIT", { ...state, ...update });
  return update;
}

async function fetchKivoContextNode(state: typeof FieldInsightState.State) {
  logHeader("FIELD INSIGHTS: FETCH KIVO CONTEXT", "36", "📦");
  logState("ENTRY", state);

  const ticketId = state.classification?.ticketId;
  const retrievedContext = await fetchKivoContext(state.teamId, ticketId);

  logSection("Retrieved Kivo Context (Truncated)", retrievedContext.substring(0, 500));

  const update = { retrievedContext };
  logState("EXIT", { ...state, ...update });
  return update;
}

async function answerSimpleQuestionNode(state: typeof FieldInsightState.State) {
  logHeader("FIELD INSIGHTS: ANSWER SIMPLE QUESTION", "32", "💬");
  logState("ENTRY", state);

  const lang = state.lang || "en";
  const langName = lang === "pt" ? "Portuguese (Brazil)" : lang === "zh" ? "Chinese (Simplified)" : "English";

  const systemPrompt = [
    `=== LANGUAGE REQUIREMENT ===`,
    `Target Language: ${langName}`,
    `RULE: Your response MUST be written entirely in ${langName}.`,
    `The language of the user's message is IRRELEVANT to the language of your response.`,
    `Responding in any language other than ${langName} is a CRITICAL ERROR.`,
    `=============================`,
    ``,
    `You are the Team Leader (Coordinator) talking to the Kivo Operator.`,
    `Be direct and pragmatic. Do NOT greet them by name.`,
    ``,
    `Below is the retrieved context related to their query:`,
    state.retrievedContext || "No specific details retrieved.",
    ``,
    `Respond as the Team Leader. Be helpful, professional, direct and concise.`,
    `Answer the user's query based on the context. If no context was retrieved or the query is a simple greeting, respond conversationally.`,
    `Keep the response to 1-2 concise sentences in a single paragraph. No markdown lists or tables.`,
    ``,
    `[REMINDER: Write in ${langName} ONLY. Do NOT use the input language.]`,
  ].join("\n");

  const userPrompt = `Operator (your response MUST be in ${langName}): "${state.requestDetails}"`;

  logPrompt("answerSimpleQuestion", systemPrompt, userPrompt);

  const response = await getLlm().invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ]);

  const replyText = String(response.content || "").trim();
  logSection("Simple Question Answer", replyText);

  const update = { leaderThought: replyText, suggestedTitle: "General Inquiry" };
  logState("EXIT", { ...state, ...update });
  return update;
}



async function evaluateMatchedCapabilityNode(state: typeof FieldInsightState.State) {
  logHeader("FIELD INSIGHTS: EVALUATE MATCHED CAPABILITY", "34", "⚖️");
  logState("ENTRY", state);

  if (!state.matchedCapability) return {};

  const lang = state.lang || "en";
  const langName = lang === "pt" ? "Portuguese (Brazil)" : lang === "zh" ? "Chinese (Simplified)" : "English";

  const inputsDesc = await resolveInputsDescription(state.matchedCapability, state.teamId);
  const requiresInputs = inputsDesc.length > 0 &&
                         !inputsDesc.toLowerCase().includes("none") &&
                         !inputsDesc.toLowerCase().includes("does not require");

  const langBlock = [
    `=== LANGUAGE REQUIREMENT ===`,
    `Target Language: ${langName}`,
    `RULE: Your response MUST be written entirely in ${langName}.`,
    `The language of the user's message is IRRELEVANT. You respond ONLY in ${langName}.`,
    `=============================`,
  ].join("\n");

  let prompt = "";
  if (!requiresInputs) {
    prompt = `${langBlock}

    You are the Team Leader (Coordinator) talking to the Kivo Operator.
    Be concise, direct, and pragmatic. Do NOT greet the operator by name.
    State that we matched this request to capability "${state.matchedCapability.name}", which requires no inputs, and that they can submit the request now so the team can begin.
    Keep the response to 1-2 concise sentences in a single paragraph. No markdown lists or tables.
    NEVER copy, repeat, or echo the operator's input query.
    [REMINDER: Respond in ${langName} ONLY]`;
  } else {
    prompt = `${langBlock}

    You are the Team Leader (Coordinator) talking to the Kivo Operator.
    Be concise, direct, and pragmatic. Do NOT greet the operator by name.
    The capability "${state.matchedCapability.name}" requires these inputs:
    "${inputsDesc}"

    The operator provided these details:
    "${state.requestDetails.trim()}"

    Check if the details contain the required inputs.
    - If they DO (set isSufficient to true): State that we have enough details and they can submit the request.
    - If they DO NOT (set isSufficient to false): Clearly state what required details are missing.

    Be smart and flexible: match parameter names in a case-insensitive manner (e.g. "ticketID", "Ticket ID", or "ID" matches "ticketId") and recognize translations or slightly different formats. As long as the details provide values for the required parameters, consider them sufficient.
    
    Keep the response to 1-2 concise sentences in a single paragraph. No markdown lists or tables.
    CRITICAL RULES:
    1. NEVER copy, repeat, or echo the operator's input query.
    2. Write a genuine, direct response as the Team Leader.
    [REMINDER: Respond in ${langName} ONLY]`;
  }

  logPrompt("evaluateMatchedCapability", "Evaluate input sufficiency.", prompt);

  const structuredLlm = getLlm().withStructuredOutput(z.object({
    isSufficient: z.boolean(),
    message: z.string().describe(`The response message to display as Leader thoughts. Write this message in ${langName}. DO NOT greet the operator by name and DO NOT repeat the operator query details.`)
  }));
  const result = await structuredLlm.invoke(prompt);

  logSection("Evaluation Result", result);

  const update = { 
    leaderThought: result.message,
    suggestedCapabilityIdentifier: state.matchedCapability.identifier,
    suggestedTitle: state.matchedCapability.name
  };
  logState("EXIT", { ...state, ...update });
  return update;
}

async function evaluateSelectedCapabilityNode(state: typeof FieldInsightState.State) {
  logHeader("FIELD INSIGHTS: EVALUATE SELECTED CAPABILITY", "34", "⚖️");
  logState("ENTRY", state);

  let cap = null;
  if (state.capabilityIdentifier) {
    cap = await getCapabilityByIdentifier(state.teamId, state.capabilityIdentifier);
  }

  if (!cap) {
    const update = { leaderThought: getCapabilityNotFoundMessage(state.lang), suggestedCapabilityIdentifier: null };
    logState("EXIT (NOT FOUND)", { ...state, ...update });
    return update;
  }

  const lang = state.lang || "en";
  const langName = lang === "pt" ? "Portuguese (Brazil)" : lang === "zh" ? "Chinese (Simplified)" : "English";

  const inputsDesc = await resolveInputsDescription(cap, state.teamId);
  const requiresInputs = inputsDesc.length > 0 &&
                         !inputsDesc.toLowerCase().includes("none") &&
                         !inputsDesc.toLowerCase().includes("does not require");

  const langBlock = [
    `=== LANGUAGE REQUIREMENT ===`,
    `Target Language: ${langName}`,
    `RULE: Your response MUST be written entirely in ${langName}.`,
    `The language of the user's message is IRRELEVANT. You respond ONLY in ${langName}.`,
    `=============================`,
  ].join("\n");

  let prompt = "";
  if (!requiresInputs) {
    prompt = `${langBlock}

    You are the Team Leader (Coordinator) talking to the Kivo Operator.
    Be concise, direct, and pragmatic. Do NOT greet the operator by name.
    State that the capability "${cap.name}" requires no inputs, and that they can submit the request now so the team can begin.
    Keep the response to 1-2 concise sentences in a single paragraph. No markdown lists or tables.
    NEVER copy, repeat, or echo the operator's input query.
    [REMINDER: Respond in ${langName} ONLY]`;
  } else {
    prompt = `${langBlock}

    You are the Team Leader (Coordinator) talking to the Kivo Operator.
    Be concise, direct, and pragmatic. Do NOT greet the operator by name.
    The capability "${cap.name}" requires these inputs:
    "${inputsDesc}"

    The operator provided these details:
    "${state.requestDetails.trim()}"

    Check if the details contain the required inputs.
    - If they DO (set isSufficient to true): State that we have enough details and they can submit the request.
    - If they DO NOT (set isSufficient to false): Clearly state what required details are missing.

    Be smart and flexible: match parameter names in a case-insensitive manner (e.g. "ticketID", "Ticket ID", or "ID" matches "ticketId") and recognize translations or slightly different formats. As long as the details provide values for the required parameters, consider them sufficient.
    
    Keep the response to 1-2 concise sentences in a single paragraph. No markdown lists or tables.
    CRITICAL RULES:
    1. NEVER copy, repeat, or echo the operator's input query.
    2. Write a genuine, direct response as the Team Leader.
    [REMINDER: Respond in ${langName} ONLY]`;
  }

  logPrompt("evaluateSelectedCapability", "Evaluate input sufficiency.", prompt);

  const structuredLlm = getLlm().withStructuredOutput(z.object({
    isSufficient: z.boolean(),
    message: z.string().describe(`The response message to display as Leader thoughts. Write this message in ${langName}. DO NOT greet the operator by name and DO NOT repeat the operator query details.`)
  }));
  const result = await structuredLlm.invoke(prompt);

  logSection("Evaluation Result", result);

  const update = { 
    leaderThought: result.message,
    suggestedCapabilityIdentifier: cap.identifier,
    suggestedTitle: cap.name
  };
  logState("EXIT", { ...state, ...update });
  return update;
}

const capabilityMatchSchema = z.object({
  matchedCapabilityIdentifier: z.string().nullable().optional()
    .describe("The identifier of the BEST matching capability from the list, or null if none genuinely match."),
  suggestedTitle: z.string().nullable().optional()
    .describe("A concise title based ONLY on the operator's actual requestDetails. DO NOT use titles, examples, or placeholders from the Team Context or Available Capabilities templates/descriptions. Write it in the requested language (e.g. Portuguese if language is pt, English if en).")
});

// ==========================================
// NODE: MATCH CAPABILITY
// Only called for operational requests (isSimpleQuestion=false).
// Capabilities list is shown HERE, not during classification, to avoid bias.
// ==========================================
async function matchCapabilityNode(state: typeof FieldInsightState.State) {
  logHeader("FIELD INSIGHTS: MATCH CAPABILITY", "36", "🎯");
  logState("ENTRY", state);

  if (!state.capabilitiesSummary || state.capabilitiesSummary.length < 10) {
    const update = { leaderThought: getReadyToHelpMessage(state.lang) };
    logState("EXIT (NO CAPS)", { ...state, ...update });
    return update;
  }

  const lang = state.lang || "en";
  const langName = lang === "pt" ? "Portuguese (Brazil)" : lang === "zh" ? "Chinese (Simplified)" : "English";

  // NOTE: This node produces a structured JSON decision (matchedCapabilityIdentifier + suggestedTitle).
  // Only suggestedTitle is user-visible; internal matching logic can work in any language.
  const prompt = `You are a capability matcher for a specialized team.
Your output is a structured JSON decision — no prose, no markdown.

Team Context:
${state.teamContext}

The operator submitted:
"${state.requestDetails}"

Available Capabilities (things this team can actually execute):
${state.capabilitiesSummary}

RULES:
- Only match if the request clearly maps to a capability's purpose.
- Unrelated topics, general questions, or trivia MUST return null — they are NOT team tasks.
- If in doubt, return null. A wrong match is worse than no match.
- Return the identifier EXACTLY as listed, or null.
- The suggestedTitle MUST be a concise summary of the operator's actual request details. Write it in ${langName}. NEVER copy, invent, or adapt a title from the capability descriptions, templates, examples, or team context documents.
`;

  logPrompt("matchCapability", prompt, `Matching: "${state.requestDetails}"`);

  const structuredLlm = getLlm().withStructuredOutput(capabilityMatchSchema);
  const result = await structuredLlm.invoke(prompt);

  logSection("🎯 Match Result", result);

  if (result.matchedCapabilityIdentifier) {
    const matched = state.teamCapabilities.find(c => c.identifier === result.matchedCapabilityIdentifier);
    if (matched) {
      const update = { matchedCapability: matched, suggestedTitle: result.suggestedTitle || null };
      logState("EXIT (MATCHED)", { ...state, ...update });
      return update;
    }
    console.warn(`[matchCapability] Identifier "${result.matchedCapabilityIdentifier}" not found. Treating as no-match.`);
  }

  const update = {
    leaderThought: getNewActivityMessage(state.lang),
    suggestedTitle: result.suggestedTitle || getNewActivityTitle(state.lang)
  };
  logState("EXIT (NOT MATCHED)", { ...state, ...update });
  return update;
}

// ==========================================
// CONDITIONAL ROUTING FUNCTIONS
// ==========================================
function routeAfterClassification(state: typeof FieldInsightState.State) {
  // Pre-selected capability from the UI → evaluate it directly
  if (state.capabilityIdentifier) return "evaluateSelectedCapability";

  const category = state.classification?.category;
  const isSimpleQuestion = state.classification?.isSimpleQuestion ?? true;
  const ticketId = state.classification?.ticketId;

  // PRIORITY: If a ticket ID was detected, ALWAYS route to matchCapability.
  // This handles mixed messages like "oi tudo bom? ... preciso do ticket KVO-110"
  // where the greeting may cause classification as 'conversational' but the
  // actual intent is to look up the ticket via a capability.
  if (ticketId) {
    return "matchCapability";
  }

  // Hard guard: web_search and conversational → answer directly (no ticket ID present).
  if (category === "conversational" || category === "web_search") {
    return "answerSimpleQuestion";
  }

  // External integration query without a ticketId → match a capability.
  if (category === "external_integration") {
    return "matchCapability";
  }

  // Team-related simple question → fetch Kivo DB context before answering.
  if (isSimpleQuestion) {
    if (category === "kivo") return "fetchKivoContext";
    return "answerSimpleQuestion";
  }

  // Operational request (not a simple question) → try to match a capability.
  return "matchCapability";
}

function routeAfterMatchCapability(state: typeof FieldInsightState.State) {
  if (state.matchedCapability) return "evaluateMatchedCapability";
  return END;
}

// ==========================================
// WORKFLOW COMPILATION
// ==========================================
const workflow = new StateGraph(FieldInsightState)
  .addNode("fetchContexts", fetchContextsNode)
  // Step 1: Fast classification — small focused prompt, NO capabilities shown (avoids bias)
  .addNode("classifyRequest", classifyRequestNode)
  // Step 2a: For kivo status queries only — fetch DB context before answering
  .addNode("fetchKivoContext", fetchKivoContextNode)
  // Step 2b: Simple answer (conversational, kivo status, web questions)
  .addNode("answerSimpleQuestion", answerSimpleQuestionNode)
  // Step 2c: Pre-selected capability evaluation (from UI dropdown)
  .addNode("evaluateSelectedCapability", evaluateSelectedCapabilityNode)
  // Step 2d: Capability match — capabilities list shown HERE only, after classification
  .addNode("matchCapability", matchCapabilityNode)
  // Step 3: Evaluate matched capability — check inputs, prompt user to submit
  .addNode("evaluateMatchedCapability", evaluateMatchedCapabilityNode)

  .addEdge(START, "fetchContexts")
  .addEdge("fetchContexts", "classifyRequest")
  .addConditionalEdges("classifyRequest", routeAfterClassification)

  .addEdge("fetchKivoContext", "answerSimpleQuestion")
  .addEdge("answerSimpleQuestion", END)
  .addEdge("evaluateSelectedCapability", END)
  .addConditionalEdges("matchCapability", routeAfterMatchCapability)
  .addEdge("evaluateMatchedCapability", END);

export const fieldInsightWorkflow = workflow.compile();

export async function runFieldInsight(
  teamId: string,
  requestDetails: string,
  capabilityIdentifier?: string,
  operatorName?: string,
  lang?: string
) {
  const result = await fieldInsightWorkflow.invoke({
    teamId,
    requestDetails,
    capabilityIdentifier: capabilityIdentifier || null,
    operatorName: operatorName || "Operator",
    lang: lang || "en",
    retrievedContext: null
  });
  return {
    leaderThought: result.leaderThought,
    suggestedCapabilityIdentifier: result.suggestedCapabilityIdentifier,
    suggestedTitle: result.suggestedTitle
  };
}

export async function runFieldInsightStream(
  teamId: string,
  requestDetails: string,
  capabilityIdentifier?: string,
  operatorName?: string,
  lang?: string,
  onProgress?: (nodeName: string) => void
) {
  const stream = await fieldInsightWorkflow.stream(
    {
      teamId,
      requestDetails,
      capabilityIdentifier: capabilityIdentifier || null,
      operatorName: operatorName || "Operator",
      lang: lang || "en",
      retrievedContext: null
    },
    { streamMode: "updates" }
  );

  let leaderThought = null;
  let suggestedCapabilityIdentifier = null;
  let suggestedTitle = null;

  for await (const chunk of stream) {
    const nodeName = Object.keys(chunk)[0];
    if (onProgress) onProgress(nodeName);

    const update = (chunk as any)[nodeName];
    if (update.leaderThought !== undefined) leaderThought = update.leaderThought;
    if (update.suggestedCapabilityIdentifier !== undefined) suggestedCapabilityIdentifier = update.suggestedCapabilityIdentifier;
    if (update.suggestedTitle !== undefined) suggestedTitle = update.suggestedTitle;
  }

  return {
    leaderThought,
    suggestedCapabilityIdentifier,
    suggestedTitle
  };
}
