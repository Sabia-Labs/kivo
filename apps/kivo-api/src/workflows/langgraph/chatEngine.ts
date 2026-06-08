import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { z } from "zod";
import { LLMFactory } from "./integrations/llm-factory";
import { db } from "../../db/client";
import { agents, teams, users, requests, messages, conversations, integrations, teamCapabilities } from "../../db/schema";
import { eq, desc, and } from "drizzle-orm";
import { resolveWorkspaceLanguage } from "../../lib/i18n";
import { ConnectorFactory } from "./integrations/factory";
import { getToolsForAdapters } from "./integrations/tools";
import { getKivoTools } from "./integrations/kivoTools";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

// ── State Definition ──────────────────────────────────────────────────────────

export const ChatEngineState = Annotation.Root({
  conversationId: Annotation<string>,
  teamId: Annotation<string>,
  agentId: Annotation<string>,
  userId: Annotation<string>,
  userMessage: Annotation<string>,
  intent: Annotation<string>,
  contextData: Annotation<any>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({})
  }),
  mcpResults: Annotation<any[]>({
    reducer: (a, b) => a.concat(b || []),
    default: () => []
  }),
  agentResponse: Annotation<string>,
});

export type ChatEngineStateType = typeof ChatEngineState.State;

// ── Nodes ─────────────────────────────────────────────────────────────────────

async function classifyIntent(state: ChatEngineStateType): Promise<Partial<ChatEngineStateType>> {
  console.log(`[chat-engine:DEBUG] [Node: classifyIntent] Analyzing message: "${state.userMessage.substring(0, 50)}..."`);
  const llm = LLMFactory.createModel("orchestrator");
  const schema = z.object({
    intent: z.enum([
      "general_conversation",
      "needs_kivo_context",
      "needs_integration_data",
      "needs_integration_action",
      "create_request",
      "unsupported_action",
      "needs_clarification"
    ]),
  });

  const structuredLlm = llm.withStructuredOutput(schema);
  const prompt = `Classify the user message intent.
Message: "${state.userMessage}"

Intents:
- general_conversation: Small talk, greetings, general questions.
- needs_kivo_context: Asking about the team, agents, or Kivo platform itself.
- needs_integration_data: Asking to read/search data from external tools (Linear, Notion, GitHub).
- needs_integration_action: Asking to perform an action on external tools (comment, create issue, etc).
- create_request: Asking the agent to start a new work request/ticket in Kivo.
- unsupported_action: Asking to create a task, modify a workflow, or do things Kivo agents are not allowed to do.
- needs_clarification: Ambiguous or incomplete message.`;

  const result = await structuredLlm.invoke(prompt);
  console.log(`[chat-engine:DEBUG] [Node: classifyIntent] Classified as: ${result.intent}`);
  const returnState = { intent: result.intent };
  console.log(`[chat-engine:DEBUG] [Node: classifyIntent] Returning state:`, returnState);
  return returnState;
}

async function rejectUnsupportedAction(state: ChatEngineStateType): Promise<Partial<ChatEngineStateType>> {
  console.log(`[chat-engine:DEBUG] [Node: rejectUnsupportedAction] Guardrail triggered for unsupported action.`);
  // Hardcoded fast path: return a generic rejection for unsupported actions without using the heavy LLM to generate response.
  const returnState = {
    agentResponse: "I am an AI developer assistant. I am currently not authorized to directly alter workflows, bypass task approvals, or manipulate core system states manually. If you need to make these changes, please use the standard Kivo UI."
  };
  console.log(`[chat-engine:DEBUG] [Node: rejectUnsupportedAction] Returning state:`, returnState);
  return returnState;
}

async function loadContext(state: ChatEngineStateType): Promise<Partial<ChatEngineStateType>> {
  console.log(`[chat-engine:DEBUG] [Node: loadContext] Loading DB context for teamId: ${state.teamId}`);
  // Query Kivo context directly from DB

  // Query Kivo context directly from DB
  const [agent] = await db.select().from(agents).where(eq(agents.id, state.agentId));
  const [team] = await db.select().from(teams).where(eq(teams.id, state.teamId));
  const activeReqs = await db.select().from(requests)
    .where(and(eq(requests.teamId, state.teamId), eq(requests.status, "open")))
    .orderBy(desc(requests.createdAt))
    .limit(5);

  const capabilities = await db.select({
    identifier: teamCapabilities.identifier,
    name: teamCapabilities.name,
    instructions: teamCapabilities.instructions,
    inputsDescription: teamCapabilities.inputsDescription
  })
  .from(teamCapabilities)
  .where(eq(teamCapabilities.teamId, state.teamId));
  
  const capabilitiesSummary = capabilities.map(c => `- ${c.name} (ID: ${c.identifier}): Inputs required: ${c.inputsDescription || 'None'}`).join("\n");

  const history = await db.select().from(messages)
    .where(eq(messages.conversationId, state.conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(5);
    
  let historyText = "";
  for (const msg of history.reverse()) {
    historyText += `[${msg.role.toUpperCase()}]: ${msg.content}\n`;
  }

  console.log(`[chat-engine:DEBUG] [Node: loadContext] Loaded ${activeReqs.length} active requests for team ${team?.name}.`);

  const returnState = {
    contextData: {
      agentProfile: agent,
      teamContext: team,
      activeRequests: activeReqs,
      capabilitiesSummary,
      historyText,
    }
  };
  console.log(`[chat-engine:DEBUG] [Node: loadContext] Returning state:`, returnState);
  return returnState;
}

async function decideAndCallMCPs(state: ChatEngineStateType): Promise<Partial<ChatEngineStateType>> {
  console.log(`[chat-engine:DEBUG] [Node: decideAndCallMCPs] Checking team integrations...`);
  const mcpResults: any[] = [];
  
  try {
    let integrationInstructions = "Kivo Native Tools:\n- Role: Kivo Platform Management\n  Instructions: Use these tools to query team details, members, capabilities, and manage work requests natively in Kivo.\n";
    const connectorAdapters: Record<string, any> = {};

    const teamIntegrations = await db.select().from(integrations).where(eq(integrations.teamId, state.teamId));
    
    for (const integ of teamIntegrations) {
      let roleKey = integ.role ? integ.role.toLowerCase().replace(/\s+/g, "_") : "";
      if (roleKey.includes("ticket")) roleKey = "ticketing";
      else if (roleKey.includes("knowledge")) roleKey = "knowledge_base";
      else if (roleKey.includes("calendar")) roleKey = "calendar";
      else if (roleKey.includes("code")) roleKey = "code_repository";

      const config = { ...(integ.metadata as object || {}), apiKey: integ.apiKey };
      const adapter = ConnectorFactory.createAdapter(integ.provider, config);
      
      if (adapter) {
        connectorAdapters[roleKey] = adapter;
        integrationInstructions += `- Integration Role: ${integ.role || integ.provider}\n  Instructions: ${integ.instructions || "No specific instructions."}\n`;
      }
    }

    const kivoTools = getKivoTools(state);
    const externalTools = getToolsForAdapters(connectorAdapters);
    const tools = [...kivoTools, ...externalTools];
    
    if (tools.length > 0) {
      console.log(`[chat-engine:DEBUG] [Node: decideAndCallMCPs] Bound ${tools.length} tools. Querying LLM...`);
      const llm = LLMFactory.createModel("orchestrator");
      
      if (typeof (llm as any).bindTools !== "function") {
        console.warn(`[chat-engine:DEBUG] LLM provider does not support bindTools. Skipping tools.`);
      } else {
        const llmWithTools = (llm as any).bindTools(tools);
        
        const prompt = [
          new SystemMessage(`You are a tool-calling routing agent. Your job is to check if the user's message requires fetching information from the team's tools or integrations, or if the user is asking to create a work request.
Available Team Capabilities (for creating requests):
${state.contextData?.capabilitiesSummary || "None"}

Available Team Tools & Integrations:
${integrationInstructions}

If the user wants to create a request AND has provided enough details to satisfy a capability, YOU MUST call the kivo_create_request tool. Note: targetAgentId is optional; you do not need to ask the user for it.
If the user's message matches the instructions for an integration or a native Kivo tool, YOU MUST output a tool call to fetch the data. 
If the user is just saying hello, asking a general question, or hasn't provided enough details yet, DO NOT call any tools. Just output a blank message.

Conversation History:
${state.contextData?.historyText || ""}`),
          new HumanMessage(state.userMessage)
        ];

        const response = await llmWithTools.invoke(prompt);
        
        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log(`[chat-engine:DEBUG] [Node: decideAndCallMCPs] LLM decided to call ${response.tool_calls.length} tools.`);
          
          for (const toolCall of response.tool_calls) {
            const tool = tools.find((t: any) => t.name === toolCall.name);
            if (tool) {
              try {
                console.log(`[chat-engine:DEBUG] Executing tool: ${tool.name} with args:`, toolCall.args);
                const resultStr = await tool.invoke(toolCall.args);
                mcpResults.push({
                  tool: tool.name,
                  args: toolCall.args,
                  result: resultStr
                });
              } catch (e: any) {
                console.error(`[chat-engine:DEBUG] Tool ${tool.name} failed:`, e);
                mcpResults.push({
                  tool: tool.name,
                  error: e.message
                });
              }
            }
          }
        } else {
          console.log(`[chat-engine:DEBUG] [Node: decideAndCallMCPs] LLM decided not to call any tools.`);
        }
      }
    } else {
      console.log(`[chat-engine:DEBUG] [Node: decideAndCallMCPs] No tools available.`);
    }
  } catch (err: any) {
    console.error(`[chat-engine:DEBUG] [Node: decideAndCallMCPs] Error:`, err);
  }

  const returnState = { mcpResults };
  console.log(`[chat-engine:DEBUG] [Node: decideAndCallMCPs] Returning state:`, returnState);
  return returnState;
}

async function prepareContext(state: ChatEngineStateType): Promise<Partial<ChatEngineStateType>> {
  console.log(`[chat-engine:DEBUG] [Node: prepareContext] Formatting context.`);
  // Just a pass-through node for now. Could format final string context.
  const returnState = {};
  console.log(`[chat-engine:DEBUG] [Node: prepareContext] Returning state:`, returnState);
  return returnState;
}

async function generateResponse(state: ChatEngineStateType): Promise<Partial<ChatEngineStateType>> {
  console.log(`[chat-engine:DEBUG] [Node: generateResponse] Preparing prompt for LLM.`);
  const [agent] = await db.select().from(agents).where(eq(agents.id, state.agentId));
  const [team] = await db.select().from(teams).where(eq(teams.id, state.teamId));
  const [user] = await db.select().from(users).where(eq(users.id, state.userId));
  
  // Use agent specific LLM config if available
  const llm = LLMFactory.createModel("orchestrator"); // Or pass agent specific settings if LLMFactory supports it

  const preferredName = user.preferredName || user.name;
  
  const lang = await resolveWorkspaceLanguage(state.teamId);
  const langName = lang === "pt" ? "Portuguese (Brazil)" : lang === "zh" ? "Chinese (Simplified)" : "English";
  const langBlock = [
    `=== LANGUAGE REQUIREMENT ===`,
    `Target Language: ${langName}`,
    `RULE: Your response MUST be written entirely in ${langName}.`,
    `The language of the user's message is IRRELEVANT. You respond ONLY in ${langName}.`,
    `Responding in any other language is a CRITICAL ERROR.`,
    `=============================`,
  ].join("\n");

  let prompt = `You are ${agent.name}, an AI developer agent in Kivo. 
Your own name is "${agent.name}".
You are talking to the user named ${preferredName}. ALWAYS call them by their name.

### Agent Persona & Identity
${agent.identity ? `Role & Identity: ${agent.identity}` : ""}
${agent.competence ? `Competence & Operating Instructions: ${agent.competence}` : ""}

${langBlock}

### Business Guardrails
- IMPORTANT: You have the ability to create requests using your tools. If the user wants to create a request, check if their goal matches any of the Available Team Capabilities. If it does, but lacks required inputs, **ASK THE USER** for the missing details. Once you have all the necessary information, YOU will use your tools to create the request. If you already created a request (check your Tool Results below), proudly inform the user that you have created it. **NEVER** say that you cannot create requests. **NEVER** redirect the user to the Kivo UI to create requests.
- You CANNOT manage individual tasks (which are sub-components of requests) or workflows manually. If the user asks to manage tasks or workflows directly, tell them to use the Kivo UI.
- You CANNOT silently change request/task states if not allowed.
- If they ask for unavailable integrations, explain what is currently supported.

### Available Team Capabilities
${state.contextData?.capabilitiesSummary || "None"}

### Memory & Journal
Agent's Personal Long-term Memory: ${agent.longTermMemory || "None"}
Agent's Recent Journal: ${agent.shortTermJournal || "None"}
Team's Shared Long-term Memory: ${team.longTermMemory || "None"}

### Context
Intent identified: ${state.intent}
`;

  if (state.contextData?.teamContext) {
    prompt += `\nTeam Mission: ${state.contextData.teamContext.mission || "None"}\n`;
  }

  if (state.mcpResults && state.mcpResults.length > 0) {
    prompt += `\n### Integration Tool Results\n`;
    prompt += `You successfully fetched the following data from the team's integrations. Use this data to fulfill the user's request if relevant:\n\n`;
    for (const res of state.mcpResults) {
      prompt += `--- Tool: ${res.tool} ---\n`;
      if (res.error) prompt += `Error: ${res.error}\n`;
      else prompt += `Result:\n${res.result}\n`;
    }
    prompt += `----------------------------\n`;
  }
  
  if (state.contextData?.historyText) {
    prompt += `\n### Conversation History:\n${state.contextData.historyText}`;
  }
  
  prompt += `\n### New User Message:\n${state.userMessage}`;
  prompt += `\n\nGenerate your response (in Markdown).`;

  console.log(`[chat-engine:DEBUG] [Node: generateResponse] Submitting prompt to LLM (Length: ${prompt.length} chars)`);
  const response = await llm.invoke(prompt);
  console.log(`[chat-engine:DEBUG] [Node: generateResponse] LLM returned response.`);
  const returnState = { agentResponse: response.content.toString() };
  console.log(`[chat-engine:DEBUG] [Node: generateResponse] Returning state:`, returnState);
  return returnState;
}

async function saveJournal(state: ChatEngineStateType): Promise<Partial<ChatEngineStateType>> {
  console.log(`[chat-engine:DEBUG] [Node: saveJournal] Saving response to DB.`);
  if (!state.agentResponse) return {};
  
  // 1. Save agent message to DB
  await db.insert(messages).values({
    conversationId: state.conversationId,
    role: "assistant",
    content: state.agentResponse,
  });

  // 2. Draft and save a short term journal (just a placeholder logic for now)
  const shortSummary = `Last discussed intent: ${state.intent}.`;
  await db.update(agents).set({
    shortTermJournal: shortSummary,
    updatedAt: new Date()
  }).where(eq(agents.id, state.agentId));

  console.log(`[chat-engine:DEBUG] [Node: saveJournal] Journal updated: ${shortSummary}`);
  const returnState = {};
  console.log(`[chat-engine:DEBUG] [Node: saveJournal] Returning state:`, returnState);
  return returnState;
}

async function extractAndSaveMemory(state: ChatEngineStateType): Promise<Partial<ChatEngineStateType>> {
  console.log(`[chat-engine:DEBUG] [Node: extractAndSaveMemory] Analyzing interaction for long-term memory.`);
  if (!state.agentResponse) return {};
  
  const llm = LLMFactory.createModel("orchestrator");
  const schema = z.object({
    saveMemory: z.boolean().describe("True if there is an explicit request to remember something or an obvious, very important new piece of information that MUST be retained long-term."),
    target: z.enum(["agent", "team", "none"]).describe("If saveMemory is true, is this information specific to the agent's identity/persona ('agent') or something the whole team should know ('team')?"),
    contentToAppend: z.string().describe("A concise summary of what needs to be saved. Empty if saveMemory is false."),
  });

  const structuredLlm = llm.withStructuredOutput(schema);
  const prompt = `Evaluate the recent conversation to determine if long-term memory should be updated.
User Message: "${state.userMessage}"
Agent Response: "${state.agentResponse}"

Decide if anything here represents a permanent learning, a strong user preference, an explicit instruction to remember, or vital team knowledge. If yes, extract it into a concise statement to append to long-term memory.`;

  try {
    const result = await structuredLlm.invoke(prompt);
    console.log(`[chat-engine:DEBUG] [Node: extractAndSaveMemory] LLM Decision: saveMemory=${result.saveMemory}, target=${result.target}`);
    
    if (result.saveMemory && result.contentToAppend && result.target !== "none") {
      console.log(`[chat-engine:DEBUG] [Node: extractAndSaveMemory] Appending to ${result.target} memory: ${result.contentToAppend}`);
      const appendText = `\n- [${new Date().toISOString().split('T')[0]}] ${result.contentToAppend}`;
      
      if (result.target === "agent") {
        const [agent] = await db.select().from(agents).where(eq(agents.id, state.agentId));
        const newMemory = (agent.longTermMemory || "") + appendText;
        await db.update(agents).set({ longTermMemory: newMemory.trim(), updatedAt: new Date() }).where(eq(agents.id, state.agentId));
      } else if (result.target === "team") {
        const [team] = await db.select().from(teams).where(eq(teams.id, state.teamId));
        const newMemory = (team.longTermMemory || "") + appendText;
        await db.update(teams).set({ longTermMemory: newMemory.trim(), updatedAt: new Date() }).where(eq(teams.id, state.teamId));
      }
    }
  } catch (err) {
    console.error(`[chat-engine] Failed to extract memory:`, err);
  }

  const returnState = {};
  console.log(`[chat-engine:DEBUG] [Node: extractAndSaveMemory] Returning state:`, returnState);
  return returnState;
}

// ── Graph Construction ────────────────────────────────────────────────────────

function routeAfterIntent(state: ChatEngineStateType) {
  let route = "loadContext";
  if (state.intent === "unsupported_action") route = "rejectUnsupportedAction";
  else if (state.intent === "general_conversation" || state.intent === "needs_clarification") route = "generateResponse";
  
  console.log(`[chat-engine:DEBUG] [Edge: routeAfterIntent] Intent '${state.intent}' -> Routing to '${route}'`);
  return route;
}

export function buildChatEngineGraph() {
  return new StateGraph(ChatEngineState)
    .addNode("classifyIntent", classifyIntent)
    .addNode("loadContext", loadContext)
    .addNode("decideAndCallMCPs", decideAndCallMCPs)
    .addNode("prepareContext", prepareContext)
    .addNode("generateResponse", generateResponse)
    .addNode("rejectUnsupportedAction", rejectUnsupportedAction)
    .addNode("saveJournal", saveJournal)
    .addNode("extractAndSaveMemory", extractAndSaveMemory)
    .addEdge(START, "classifyIntent")
    .addConditionalEdges("classifyIntent", routeAfterIntent, {
      "rejectUnsupportedAction": "rejectUnsupportedAction",
      "generateResponse": "generateResponse",
      "loadContext": "loadContext"
    })
    .addEdge("loadContext", "decideAndCallMCPs")
    .addEdge("decideAndCallMCPs", "prepareContext")
    .addEdge("prepareContext", "generateResponse")
    .addEdge("rejectUnsupportedAction", "saveJournal")
    .addEdge("generateResponse", "saveJournal")
    .addEdge("saveJournal", "extractAndSaveMemory")
    .addEdge("extractAndSaveMemory", END)
    .compile();
}

export async function runChatEngine(initialState: Partial<ChatEngineStateType>) {
  const graph = buildChatEngineGraph();
  await graph.invoke(initialState as ChatEngineStateType);
}
