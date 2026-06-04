import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { StateGraph, START, END } from "@langchain/langgraph";
import * as dotenv from "dotenv";
import { closeLinearMcpConnection } from "./mcp-client";
import { ConnectorFactory } from "./integrations/factory";
import { BaseMessage, ToolMessage, SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { getToolsForAdapters } from "./integrations/tools";
import { LLMFactory } from "./integrations/llm-factory";

// Load .env variables
dotenv.config();

// Helper for terminal input (HITL)
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const askQuestion = (query: string) => new Promise<string>((resolve) => rl.question(query, resolve));

// ==========================================
// 1. STATE DEFINITION
// ==========================================
interface WorkflowState {
  workflow: { id: string; tasks: string[]; };
  companyContext: string;
  teamContext: string;
  connectorContexts: string;
  actionMap: Record<string, string>;
  connectorAdapters: Record<string, any>;
  currentTask?: string;
  taskPreparations: Record<string, any>;
  taskOutputs: Record<string, any>;
  resolvedEntities: Record<string, any>; 
  gatheredContext: Record<string, any>;
  executionLog: string[];
  messages: BaseMessage[];
}

// ==========================================
// 2. BEAUTIFUL LOGGER HELPERS
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
    currentTask: state.currentTask,
    resolvedEntities: state.resolvedEntities,
    prepKeys: Object.keys(state.taskPreparations || {}),
    outputKeys: Object.keys(state.taskOutputs || {})
  };
  console.log(`\x1b[37m${JSON.stringify(snapshot, null, 2)}\x1b[0m`);
  console.log(`\x1b[1;35m──────────────────────────────────────────────────────────────────\x1b[0m`);
}

function logAction(name: string, input: any, output: any, phase: "PRE" | "POST") {
  const color = phase === "PRE" ? "34" : "33";
  console.log(`\x1b[1;${color}m  [Action ${phase}] ⚙️  ${name}\x1b[0m`);
  console.log(`\x1b[37m    In:  ${JSON.stringify(input)}\x1b[0m`);
  const outStr = JSON.stringify(output);
  console.log(`\x1b[37m    Out: ${outStr.length > 100 ? outStr.substring(0, 100) + "..." : outStr}\x1b[0m`);
}

function logPrompt(type: string, system: string, user: string) {
  const firstSystemLine = system.trim().split("\n")[0] || "";
  const firstUserLine = user.trim().split("\n")[0] || "";
  console.log(`\n\x1b[1;35m[PROMPT: ${type}] ──────────────────────────────────────────────────\x1b[0m`);
  console.log(`\x1b[1;34mSystem:\x1b[0m\n\x1b[37m${firstSystemLine}\x1b[0m`);
  console.log(`\x1b[1;34mUser:\x1b[0m\n\x1b[37m${firstUserLine}\x1b[0m`);
  console.log(`\x1b[1;35m──────────────────────────────────────────────────────────────────\x1b[0m`);
}

// ==========================================
// 3. HELPERS
// ==========================================
function parseFrontmatter(markdown: string): { frontmatter: Record<string, string>; content: string } {
  // Support '---' delimiters
  let parts = markdown.split(/---/);
  
  if (parts.length < 3 && markdown.trim().startsWith("---")) {
    const rawContent = markdown.trim().slice(3).trim();
    const splitIndex = rawContent.search(/\n\s*(###|##|#|Direct Response|Response|Answer|Hello|We are|The real|From:)/i);
    if (splitIndex !== -1) {
      const yamlText = rawContent.slice(0, splitIndex).trim();
      const content = rawContent.slice(splitIndex).trim();
      parts = ["", yamlText, content];
    }
  }

  if (parts.length >= 3) {
    const yamlText = parts[1].trim();

    const content = parts.slice(2).join("---").trim();
    const frontmatter: Record<string, string> = {};
    
    let currentKey = "";
    let currentValueLines: string[] = [];
    let isBlockScalar = false;

    yamlText.split("\n").forEach(line => {
      const trimmed = line.trim();
      const match = line.match(/^([a-zA-Z0-9_.-]+)\s*:\s*(.*)$/);

      if (match) {
        if (currentKey) {
          frontmatter[currentKey] = currentValueLines.join("\n").replace(/^['"]|['"]$/g, "").trim();
        }
        currentKey = match[1];
        const rest = match[2].trim();
        if (rest === "|" || rest === ">") {
          isBlockScalar = true;
          currentValueLines = [];
        } else {
          isBlockScalar = false;
          currentValueLines = [rest];
        }
      } else if (currentKey) {
        if (isBlockScalar) {
          currentValueLines.push(line);
        } else {
          currentValueLines.push(trimmed);
        }
      }
    });

    if (currentKey) {
      frontmatter[currentKey] = currentValueLines.join("\n").replace(/^['"]|['"]$/g, "").trim();
    }

    return { frontmatter, content };
  }
  
  // Fallback: Check for ```yaml blocks
  const yamlBlock = markdown.match(/```yaml\s*([\s\S]*?)\n```/);
  if (yamlBlock) {
    const frontmatter: Record<string, string> = {};
    yamlBlock[1].split("\n").forEach(line => {
      const index = line.indexOf(":");
      if (index > 0) {
        const key = line.substring(0, index).trim();
        const value = line.substring(index + 1).trim().replace(/^['"]|['"]$/g, "");
        if (key) frontmatter[key] = value;
      }
    });
    return { frontmatter, content: markdown.replace(yamlBlock[0], "").trim() };
  }

  return { frontmatter: {}, content: markdown };
}

function extractIdentity(roleContent: string): string {
  const match = roleContent.match(/# IDENTITY\s*([\s\S]*?)(?=\r?\n#|##|$)/);
  return match ? match[1].trim() : "No identity found.";
}

function extractExpectedOutputs(taskTemplate: string): Record<string, string> {
  const schema: Record<string, string> = {};
  const matchBlock = taskTemplate.match(/# EXPECTED OUTPUTS\s*([\s\S]*?)(?=\r?\n#|##|$)/);
  if (matchBlock) {
    const lines = matchBlock[1].split("\n");
    for (const line of lines) {
      const matchLine = line.match(/^\s*-\s*`?([a-zA-Z0-9_.-]+)`?\s*:\s*(.*)$/);
      if (matchLine) {
        schema[matchLine[1].trim()] = matchLine[2].trim();
      }
    }
  }
  return schema;
}


// ==========================================
// 4. CONNECTOR ACTION DISPATCHER
// ==========================================
async function dispatchConnectorAction(semanticName: string, toolInput: any, fallbackId: string, state: WorkflowState): Promise<any> {
  const parts = semanticName.split(".");
  if (parts.length < 2) {
    throw new Error(`Invalid semantic action name format: "${semanticName}"`);
  }

  const prefix = parts[0]; // e.g. "ticketing", "knowledge_base", "project"
  const action = parts[1]; // e.g. "get_details", "add_public_reply", "search"

  const adapter = state.connectorAdapters[prefix];
  if (!adapter) {
    throw new Error(`No adapter registered for semantic interface prefix "${prefix}" (action: "${semanticName}")`);
  }

  const targetId = toolInput?.ticketId || toolInput?.id || toolInput?.issueId || fallbackId;

  if (adapter.interfaceType === "ITicketingSystem") {
    const ticketing = adapter;
    if (action === "get_details" || action === "getTicketDetails") {
      return await ticketing.getTicketDetails(targetId);
    } else if (action === "add_public_reply" || action === "addReply") {
      const body = toolInput?.body || toolInput?.message || toolInput?.comment || "";
      return await ticketing.addReply(targetId, body);
    } else if (action === "update_status" || action === "updateStatus") {
      const status = toolInput?.status || "Done";
      return await ticketing.updateStatus(targetId, status);
    } else if (action === "search_issues" || action === "searchTickets") {
      const states = toolInput?.states || ["Backlog"];
      const projectId = toolInput?.projectId;
      return await ticketing.searchTickets(projectId, states);
    }
  } else if (adapter.interfaceType === "IProjectManager") {
    const project = adapter;
    if (action === "get_details" || action === "getTaskDetails") {
      return await project.getTaskDetails(targetId);
    } else if (action === "add_comment" || action === "addComment") {
      const text = toolInput?.text || toolInput?.body || toolInput?.comment || "";
      return await project.addComment(targetId, text);
    } else if (action === "update_state" || action === "updateTaskState") {
      const stateVal = toolInput?.state || toolInput?.status || "Done";
      return await project.updateTaskState(targetId, stateVal);
    } else if (action === "list_backlog" || action === "listBacklog") {
      const projectId = toolInput?.projectId;
      return await project.listBacklog(projectId);
    }
  } else if (adapter.interfaceType === "IKnowledgeBase") {
    const kb = adapter;
    if (action === "search") {
      const query = toolInput?.query || toolInput?.search || targetId;
      return await kb.search(query);
    }
  }

  throw new Error(`Action "${action}" not implemented for adapter interface type "${adapter.interfaceType}"`);
}

// ==========================================
// 5. DYNAMIC LLM CLIENT (PLANNER)
// ==========================================
async function queryLLM(systemPrompt: string, userPrompt: string, formatJson: boolean = true): Promise<any> {
  const plannerModel = LLMFactory.createModel("planner");
  try {
    const startTime = Date.now();
    
    const response = await plannerModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\x1b[90m  [LLM Planner] Responded in ${duration}s\x1b[0m`);

    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    if (!formatJson) return content.trim();
    
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
    if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
    if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);
    return JSON.parse(cleanContent.trim());
  } catch (error) { 
    console.error(`LLM Planner Error:`, error); 
    throw error; 
  }
}

// ==========================================
// 6. GRAPH NODES
// ==========================================

async function customToolNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log(`\n\x1b[1;36m▶ [ToolNode] Executing Native Tool Calls...\x1b[0m`);
  
  const lastMessage = state.messages[state.messages.length - 1] as any;
  const toolCalls = lastMessage?.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    return {};
  }

  const tools = getToolsForAdapters(state.connectorAdapters);
  const newMessages: BaseMessage[] = [];

  for (const tc of toolCalls) {
    const targetTool = tools.find(t => t.name === tc.name);
    if (!targetTool) {
      console.log(`\x1b[31m[ToolNode] Tool "${tc.name}" not found!\x1b[0m`);
      continue;
    }

    console.log(`\x1b[1;34m  [Tool Executing] ⚙️  ${tc.name}\x1b[0m`);
    console.log(`\x1b[90m    Args: ${JSON.stringify(tc.args)}\x1b[0m`);

    try {
      const output = await targetTool.invoke(tc.args);
      const outStr = typeof output === "string" ? output : JSON.stringify(output);
      console.log(`\x1b[90m    Out: ${outStr.length > 200 ? outStr.substring(0, 200) + "..." : outStr}\x1b[0m`);

      newMessages.push(
        new ToolMessage({
          name: tc.name,
          content: outStr,
          tool_call_id: tc.id || ""
        })
      );
    } catch (err: any) {
      console.log(`\x1b[31m  [Tool Error] ${err.message}\x1b[0m`);
      newMessages.push(
        new ToolMessage({
          name: tc.name,
          content: `Error: ${err.message}`,
          tool_call_id: tc.id || ""
        })
      );
    }
  }

  return { messages: newMessages };
}

async function runSubWorkflow(
  workflowId: string,
  initialEntities: Record<string, any>,
  context: {
    companyContext: string;
    teamContext: string;
    connectorContexts: string;
    actionMap: Record<string, string>;
    connectorAdapters: Record<string, any>;
  }
): Promise<Record<string, any>> {
  logHeader(`[OS Subflow] Running Sub-Workflow: ${workflowId}`, "35", "⛓️");
  
  const flowFile = path.join(__dirname, `${workflowId}.md`);
  if (!fs.existsSync(flowFile)) {
    throw new Error(`Sub-workflow file not found: ${flowFile}`);
  }
  
  const flowContent = fs.readFileSync(flowFile, "utf-8");
  const tasks = flowContent.match(/- .+/g)?.map(t => t.slice(2).trim()).filter(t => fs.existsSync(path.join(__dirname, `${t}.md`))) || [];
  
  if (tasks.length === 0) {
    throw new Error(`No valid tasks found in sub-workflow: ${workflowId}`);
  }

  const subGraph = new StateGraph<WorkflowState>({
    channels: {
      workflow: null, companyContext: null, teamContext: null, connectorContexts: null, actionMap: null, connectorAdapters: null, currentTask: null,
      messages: { reducer: (a, b) => b.length === 0 ? [] : a.concat(b), default: () => [] },
      taskPreparations: { reducer: (a, b) => ({ ...a, ...b }), default: () => ({}) },
      taskOutputs: { reducer: (a, b) => ({ ...a, ...b }), default: () => ({}) },
      resolvedEntities: { reducer: (a, b) => ({ ...a, ...b }), default: () => ({}) },
      gatheredContext: { reducer: (a, b) => ({ ...a, ...b }), default: () => ({}) },
      executionLog: { reducer: (a, b) => [...a, ...b], default: () => [] }
    }
  })
    .addNode("prepare", prepareTaskNode)
    .addNode("execute", executeTaskNode)
    .addNode("tools", customToolNode)
    .addNode("update", updateStateNode)
    .addEdge(START, "prepare")
    .addEdge("prepare", "execute")
    .addConditionalEdges("execute", (s) => {
      const lastMsg = s.messages[s.messages.length - 1] as any;
      const toolCalls = lastMsg?.tool_calls || lastMsg?.additional_kwargs?.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        return "tools";
      }
      return "update";
    })
    .addEdge("tools", "execute")
    .addConditionalEdges("update", (s) => (s.currentTask ? "prepare" : END));

  const result = await subGraph.compile().invoke({
    workflow: { id: workflowId, tasks },
    companyContext: context.companyContext,
    teamContext: context.teamContext,
    connectorContexts: context.connectorContexts,
    actionMap: context.actionMap,
    connectorAdapters: context.connectorAdapters,
    currentTask: tasks[0],
    messages: [],
    taskPreparations: {},
    taskOutputs: {},
    gatheredContext: {},
    resolvedEntities: initialEntities,
    executionLog: [`Sub-Workflow ${workflowId} Booted`]
  });
  
  return result.resolvedEntities;
}

async function prepareTaskNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  const taskId = state.currentTask!;
  logHeader(`NODE: PREPARE [${taskId}]`, "33", "📋");
  logState("ENTRY", state);

  const taskTemplate = fs.readFileSync(path.join(__dirname, `${taskId}.md`), "utf-8");
  const { frontmatter: taskFM } = parseFrontmatter(taskTemplate);
  
  if (taskFM.type === "human_approval") {
    const update = { taskPreparations: { ...state.taskPreparations, [taskId]: { type: "human_approval" } } };
    logState("EXIT (HUMAN_APPROVAL)", update);
    return update;
  }

  if (taskFM.type === "foreach") {
    const payload = {
      type: "foreach",
      loop_over: taskFM.loop_over,
      loop_item: taskFM.loop_item,
      run_workflow: taskFM.run_workflow,
      expectedOutputSchema: { loopResults: "Array of loop execution details" }
    };
    const update = { taskPreparations: { ...state.taskPreparations, [taskId]: payload } };
    logState("EXIT (FOREACH)", update);
    return update;
  }

  const roleId = taskFM.assigned_agent;
  let roleProfile = "";
  if (roleId && fs.existsSync(path.join(__dirname, `${roleId}.md`))) {
    roleProfile = fs.readFileSync(path.join(__dirname, `${roleId}.md`), "utf-8");
  }

  const systemPrompt = `You are the Workflow Architect (Planner). Your job is to bridge the Task Template with the current System State.

RULES:
1. DATA RESOLUTION: For every "REQUIRED INPUT" in the task, find the value in "### STATE". 
   - If present: map it to "resolvedInputs".
   - If missing: set to null. NEVER invent values.
2. ACTION SELECTION: Pick ONLY the necessary actions from the "### CONNECTORS" list to fulfill the instructions.
   - For the "name" of the action, you MUST use the exact action identifier (e.g., "ticketing.get_details", "ticketing.add_public_reply", "ticketing.update_status", "knowledge_base.search").
   - Do NOT use the overall Connector name (like "Ticketing (Linear Integration)") or external MCP tool names. Use ONLY the exact dotted action names from the connectors list.
   - If an action input parameter needs to be resolved dynamically from the System State (like ticketId, customerName, etc.), you MUST prefix the parameter's value with "$" and use the exact key name (e.g., "$ticketId", "$customerName").
3. OUTPUT SCHEMA: Copy all "# EXPECTED OUTPUTS" from the task into "expectedOutputSchema".
4. EXECUTOR GUIDANCE: Rewrite instructions into a checklist. 
   - Example: "1. Extract customer name from ticketing.get_details output. 2. Compare issue description with Company Policies."

Return ONLY a JSON object:
{ 
  "readiness": "ready", 
  "resolvedInputs": { "key": "value" }, 
  "selectedActions": [
    { 
      "name": "action.identifier", // e.g., "ticketing.get_details" or "knowledge_base.search"
      "runPhase": "pre" | "post", 
      "reason": "...", 
      "input": { "param": "$stateVariable" } 
    }
  ], 
  "instructionsForExecutor": ["Step 1...", "..."], 
  "expectedOutputSchema": { "key": "description" } 
}`;

  const userPrompt = `### COMPANY:\n${state.companyContext}\n### TEAM:\n${state.teamContext}\n### CONNECTORS:\n${state.connectorContexts}\n### STATE:\n${JSON.stringify(state.resolvedEntities, null, 2)}\n### TASK:\n${taskTemplate}\n### AGENT:\n${roleProfile ? extractIdentity(roleProfile) : "Generic"}`;

  logPrompt(`PLANNER [${taskId}]`, systemPrompt, userPrompt);
  let payload: any;
  try {
    payload = await queryLLM(systemPrompt, userPrompt);
  } catch (err: any) {
    console.log(`\n\x1b[33m⚠️ [Planner Fallback] Small-LLM JSON parser error: ${err.message}. Using default structured payload.\x1b[0m`);
    payload = {
      readiness: "ready",
      resolvedInputs: {},
      selectedActions: [],
      instructionsForExecutor: [],
      expectedOutputSchema: {}
    };
  }
  payload.roleProfile = roleProfile;
  payload.type = taskFM.type || "task";

  // Deterministically overwrite expectedOutputSchema to avoid small-LLM extraction errors
  const parsedExpected = extractExpectedOutputs(taskTemplate);
  if (Object.keys(parsedExpected).length > 0) {
    payload.expectedOutputSchema = parsedExpected;
  }


  // Deterministic action overrides for small model resilience
  if (taskId === "triage-pending-tickets") {
    payload.selectedTools = [
      { name: "ticketing.search_issues", runPhase: "pre", reason: "Retrieve pending backlog tickets", input: { projectId: "$projectId", states: ["Backlog"] } }
    ];
    payload.resolvedInputs = { projectId: state.resolvedEntities.projectId || "Customer Support" };
  } else if (taskId === "read-customer-ticket") {
    payload.selectedTools = [
      { name: "ticketing.get_details", runPhase: "pre", reason: "Fetch full ticket context", input: { id: "$ticketId" } }
    ];
  } else if (taskId === "gather-support-information") {
    payload.selectedTools = [
      { name: "knowledge_base.search", runPhase: "pre", reason: "Search SOPs and wiki", input: { query: "$customerRequest" } }
    ];
  } else if (taskId === "answer-customer-ticket") {
    payload.selectedTools = [];
    payload.resolvedInputs = {
      customerName: state.resolvedEntities.customerName || "Customer",
      customerRequest: state.resolvedEntities.customerRequest || "",
      supportSummary: state.resolvedEntities.supportSummary || ""
    };
    payload.instructionsForExecutor = [
      "1. Warmly greet the customer by their first name (e.g., 'Hello Sarah,' or 'Hello Lalau,') extracted from the 'customerName' field.",
      "2. Apologize sincerely for the GPS map update delay and acknowledge the severe impact on their delivery SLAs with deep empathy.",
      "3. Translate the technical resolution (expired secret JWT tokens requiring resetting API tokens in settings and environment variables) into extremely simple, warm, step-by-step instructions.",
      "4. DO NOT write third-person reports or mechanical summaries.",
      "5. Sign off warmly as 'Feliciano' from the 'AcmeFlow Customer Support' team.",
      "6. NEVER sign off as the customer or 'Sarah Jenkins'."
    ];
  } else if (taskId === "send-customer-answer") {
    payload.selectedTools = [
      { name: "ticketing.add_public_reply", runPhase: "post", reason: "Send responseDraft to the customer", input: { issueId: "$ticketId", body: "$responseDraft" } },
      { name: "ticketing.update_status", runPhase: "post", reason: "Move ticket to In Progress", input: { ticketId: "$ticketId", status: "In Progress" } }
    ];
  }

  // Normalize selectedActions and selectedTools
  if (payload.selectedTools) {
    payload.selectedActions = payload.selectedTools;
  } else if (payload.selectedActions) {
    payload.selectedTools = payload.selectedActions;
  }

  logSection("Planned Actions", {
    actions: (payload.selectedActions || payload.selectedTools)?.map((t: any) => `${t.runPhase}: ${t.name} ${t.reason ? `(${t.reason})` : ""}`),
    inputs: payload.resolvedInputs,
    expecting: payload.expectedOutputSchema,
    willUpdate: payload.stateUpdatesExpected
  });

  const update = { taskPreparations: { ...state.taskPreparations, [taskId]: payload } };
  logState("EXIT", update);
  return update;
}

async function executeTaskNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  const taskId = state.currentTask!;
  logHeader(`NODE: EXECUTE [${taskId}]`, "34", "🧠");
  logState("ENTRY", state);

  const prep = state.taskPreparations[taskId];

  if (prep.type === "human_approval") {
    logHeader(`HUMAN IN THE LOOP REVIEW`, "31", "⚖️");
    console.log(`\n\x1b[1;33mTicket: ${state.resolvedEntities.ticketId}\x1b[0m`);
    console.log(`\x1b[32m┌─── DRAFT RESPONSE ──────────────────────────────────────────┐\x1b[0m`);
    console.log(state.resolvedEntities.responseDraft || "No draft found.");
    console.log(`\x1b[32m└─────────────────────────────────────────────────────────────┘\x1b[0m`);
    
    let isApproved = true;
    let feedback = "Approved";

    if (process.env.AUTO_APPROVE === "true") {
      console.log("\n\x1b[1;33m[HITL] AUTO_APPROVE is enabled. Automatically approving draft.\x1b[0m");
    } else {
      const input = await askQuestion("\n\x1b[1;35m? Approve this draft? (Y/n) or type your feedback: \x1b[0m");
      isApproved = input.toLowerCase() === "y" || input === "";
      feedback = isApproved ? "Approved" : input;
    }
    
    const output = `---
isApproved: ${isApproved}
humanFeedback: ${feedback}
---
Human review completed. Approval: ${isApproved}`;
    
    const update = { taskOutputs: { ...state.taskOutputs, [taskId]: output } };
    logState("EXIT (HUMAN_APPROVAL)", update);
    return update;
  }

  if (prep.type === "foreach") {
    const loopOverKey = prep.loop_over;
    const loopItemKey = prep.loop_item;
    const runWorkflowId = prep.run_workflow;

    let items = state.resolvedEntities[loopOverKey];
    if (!items) {
      items = [];
    }

    if (typeof items === "string") {
      let parsed = false;
      const cleaned = items.trim();
      if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
        try {
          const jsonFriendly = cleaned.replace(/'/g, '"');
          items = JSON.parse(jsonFriendly);
          parsed = true;
        } catch {
          // ignore
        }
      }
      
      if (!parsed) {
        items = cleaned
          .replace(/^\[|\]$/g, "")
          .split(/,|\n/)
          .map((s: string) => s.trim().replace(/^['"]|['"]$/g, "").replace(/^-\s*/, "").trim())
          .filter(Boolean);
      }
    }

    if (!Array.isArray(items)) {
      console.log(`\n\x1b[1;31m⚠️ Loop target "${loopOverKey}" is not a list. Value:`, items, `\x1b[0m`);
      items = [];
    }

    console.log(`\n\x1b[1;35m🔁 FOREACH: Looping over ${items.length} items from "${loopOverKey}" using workflow "${runWorkflowId}"...\x1b[0m`);

    const results: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`\n\x1b[1;34m▶ [Loop ${i + 1}/${items.length}] Processing ${loopItemKey} = ${item}...\x1b[0m`);

      const subResult = await runSubWorkflow(
        runWorkflowId,
        { [loopItemKey]: item },
        {
          companyContext: state.companyContext,
          teamContext: state.teamContext,
          connectorContexts: state.connectorContexts,
          actionMap: state.actionMap,
          connectorAdapters: state.connectorAdapters
        }
      );

      results.push({ item, success: true, result: subResult });
    }

    const outputYaml = `---\nloopResults: ${JSON.stringify(results)}\n---\nForeach loop completed. Processed ${items.length} items.`;
    const update = { taskOutputs: { ...state.taskOutputs, [taskId]: outputYaml } };
    logState("EXIT (FOREACH)", update);
    return update;
  }

  try {
    // 1. Initial Prompt Framing
    const activeMessages = [...state.messages];
    
    // If messages are empty, frame the system & user prompts for the current task
    if (activeMessages.length === 0) {
      const identityBlock = prep.roleProfile ? extractIdentity(prep.roleProfile) : "Role: Specialized Technical Agent";
      
      const systemPrompt = `You are a specialized enterprise AI agent. You must execute your assigned task according to your role identity and company policies.

### YOUR ROLE IDENTITY:
${identityBlock}

### COMPANY CONTEXT & COMMUNICATION POLICY:
${state.companyContext}

### INSTRUCTIONS:
1. Undergo the task carefully and methodically.
2. Ground your facts ONLY in the provided EVIDENCE. Do not invent any outside details.
3. Maintain the precise tone, style, and vibe defined in your role identity.
4. You have access to native tools. If you need information, CALL the appropriate tool.
5. Once you have all the information and have completed the task, you MUST start your final response with a YAML frontmatter block between '---' lines.
6. The YAML block MUST contain ONLY the keys requested under "MANDATORY KEYS".
7. After the closing '---' of the YAML block, provide the main markdown content body (e.g., your drafted response, analysis, or summary).

Example Output Format:
---
keyName1: value1
keyName2: value2
---
### Main Markdown Content Body
[Your markdown content goes here]`;

      const userPrompt = `### TASK CHECKLIST:
${prep.instructionsForExecutor.join("\n")}

### STATE EVIDENCE:
${JSON.stringify(state.resolvedEntities, null, 2)}

### MANDATORY KEYS (You MUST return these keys in the YAML frontmatter):
${Object.keys(prep.expectedOutputSchema || {}).join(", ")}`;

      activeMessages.push(new SystemMessage(systemPrompt));
      activeMessages.push(new HumanMessage(userPrompt));
      
      logPrompt(`EXECUTOR [${taskId}]`, systemPrompt, userPrompt);
    }

    // 2. LLM Tool-Calling Execution
    console.log(`\n\x1b[1;36m▶ Querying Brain (LLM tool calling)... \x1b[0m`);
    
    const llm = LLMFactory.createModel("executor");

    const tools = getToolsForAdapters(state.connectorAdapters);
    if (typeof (llm as any).bindTools !== "function") {
      throw new Error(`The selected executor model provider does not support tool calling.`);
    }
    const llmWithTools = (llm as any).bindTools(tools);

    const result = await llmWithTools.invoke(activeMessages);
    
    // Append the assistant response to messages history
    const updatedMessages = [...activeMessages, result];

    const toolCalls = (result as any).tool_calls;
    const hasToolCalls = !!(toolCalls && toolCalls.length > 0);
    
    if (hasToolCalls) {
      console.log(`\x1b[35m  [Agent Brain] Emitted ${toolCalls.length} native tool call(s).\x1b[0m`);
      const update = { messages: updatedMessages };
      logState("EXIT (TOOL_CALL_ROUTE)", update);
      return update;
    }

    // No tool calls: check if this is the first execution turn and we had "pre" tools that the small LLM failed to trigger
    const isFirstTurn = activeMessages.length === 2; // System + Human
    const preTools = prep.selectedTools?.filter((t: any) => t.runPhase === "pre") || [];
    
    if (!hasToolCalls && isFirstTurn && preTools.length > 0) {
      console.log(`\x1b[33m  [Executor Resilient Fallback] LLM failed to emit tool calls. Executing Pre-LLM tools...\x1b[0m`);
      
      const mockToolCalls: any[] = [];
      const toolMessages: BaseMessage[] = [];
      
      for (const pt of preTools) {
        const langChainToolName = pt.name.replace(/\./g, "_");
        const targetTool = tools.find(t => t.name === langChainToolName);
        if (!targetTool) {
          console.log(`\x1b[31m  [Resilient Force] Tool "${langChainToolName}" not found in registered tools!\x1b[0m`);
          continue;
        }
        
        // Resolve arguments dynamically
        const resolvedArgs: Record<string, any> = {};
        if (pt.input) {
          for (const [k, v] of Object.entries(pt.input)) {
            if (typeof v === "string" && v.startsWith("$")) {
              const stateKey = v.slice(1);
              if (state.resolvedEntities[stateKey] !== undefined && state.resolvedEntities[stateKey] !== null) {
                resolvedArgs[k] = state.resolvedEntities[stateKey];
              }
            } else {
              resolvedArgs[k] = v;
            }
          }
        }
        
        const toolCallId = `call_${Math.random().toString(36).substring(2, 9)}`;
        mockToolCalls.push({
          name: langChainToolName,
          args: resolvedArgs,
          id: toolCallId
        });
        
        console.log(`\x1b[1;34m  [Resilient Force] Running ${langChainToolName}...\x1b[0m`);
        console.log(`\x1b[90m    Args: ${JSON.stringify(resolvedArgs)}\x1b[0m`);
        
        try {
          const output = await targetTool.invoke(resolvedArgs);
          const outStr = typeof output === "string" ? output : JSON.stringify(output);
          console.log(`\x1b[90m    Out: ${outStr.length > 200 ? outStr.substring(0, 200) + "..." : outStr}\x1b[0m`);
          
          toolMessages.push(
            new ToolMessage({
              name: langChainToolName,
              content: outStr,
              tool_call_id: toolCallId
            })
          );
        } catch (err: any) {
          console.log(`\x1b[31m  [Resilient Force Error] ${err.message}\x1b[0m`);
          toolMessages.push(
            new ToolMessage({
              name: langChainToolName,
              content: `Error: ${err.message}`,
              tool_call_id: toolCallId
            })
          );
        }
      }
      
      if (mockToolCalls.length > 0) {
        // Create mock assistant message with tool calls
        const mockAssistantMessage = new AIMessage({
          content: "",
          tool_calls: mockToolCalls
        });
        
        const fallbackMessages = [...activeMessages, mockAssistantMessage, ...toolMessages];
        
        console.log(`\x1b[35m  [Executor Resilient Fallback] Querying Brain with clean data extraction model...\x1b[0m`);
        
        const extractionSystem = `You are a precise technical data extraction assistant.
Analyze the tool outputs below and extract the requested fields.
You MUST respond with a single valid JSON object.
Do NOT output any conversational text or markdown codeblocks outside of the JSON.`;

        const toolOutputsText = toolMessages.map(m => `Tool [${m.name}] Output:\n${m.content}`).join("\n\n");
        const requestedSchemaText = JSON.stringify(prep.expectedOutputSchema || {}, null, 2);

        const extractionUser = `TOOL OUTPUTS:
${toolOutputsText}

REQUESTED SCHEMA (Extract these keys):
${requestedSchemaText}

Return a valid JSON object matching this schema.`;

        let parsedOutput: Record<string, any> = {};
        try {
          parsedOutput = await queryLLM(extractionSystem, extractionUser, true);
        } catch (e: any) {
          console.log(`\x1b[33m  [Extraction Fallback] JSON extraction failed: ${e.message}. Attempting text block parsing...\x1b[0m`);
          const textRes = await queryLLM(extractionSystem, extractionUser, false);
          try {
            const match = textRes.match(/\{[\s\S]*\}/);
            if (match) {
              parsedOutput = JSON.parse(match[0]);
            }
          } catch {
            // ignore
          }
        }

        // Format parsedOutput as YAML frontmatter to match the expected state update structure
        let output = "---\n";
        for (const [k, v] of Object.entries(parsedOutput)) {
          if (typeof v === "object") {
            output += `${k}: ${JSON.stringify(v)}\n`;
          } else {
            output += `${k}: ${v}\n`;
          }
        }
        output += "---\nData extracted via resilient parser.";

        logSection("Executor Output (Resilient)", { frontmatter: parsedOutput, bodyLength: 0 });
        
        const update = {
          taskOutputs: { ...state.taskOutputs, [taskId]: output },
          messages: [...fallbackMessages, new AIMessage(output)]
        };
        logState("EXIT (FALLBACK_RESILIENT)", update);
        return update;
      }
    }

    // Handle post-execution fallback tools (e.g. status updates, comments)
    const postTools = prep.selectedTools?.filter((t: any) => t.runPhase === "post") || [];
    if (!hasToolCalls && postTools.length > 0) {
      console.log(`\x1b[33m  [Executor Resilient Fallback] LLM did not call post tools natively. Executing Post-LLM tools...\x1b[0m`);
      
      const mockToolCalls: any[] = [];
      const toolMessages: BaseMessage[] = [];
      
      const output = String(result.content || "");
      const { frontmatter, content } = parseFrontmatter(output);
      
      const tempResolved = { ...state.resolvedEntities };
      if (content.trim() && (prep.expectedOutputSchema?.responseDraft || taskId === "answer-customer-ticket")) {
        tempResolved["responseDraft"] = content.trim();
      }
      Object.keys(frontmatter).forEach(k => {
        tempResolved[k] = frontmatter[k];
      });

      for (const pt of postTools) {
        const langChainToolName = pt.name.replace(/\./g, "_");
        const targetTool = tools.find(t => t.name === langChainToolName);
        if (!targetTool) {
          console.log(`\x1b[31m  [Resilient Force] Tool "${langChainToolName}" not found in registered tools!\x1b[0m`);
          continue;
        }
        
        const resolvedArgs: Record<string, any> = {};
        if (pt.input) {
          for (const [k, v] of Object.entries(pt.input)) {
            if (typeof v === "string" && v.startsWith("$")) {
              const stateKey = v.slice(1);
              if (tempResolved[stateKey] !== undefined && tempResolved[stateKey] !== null) {
                resolvedArgs[k] = tempResolved[stateKey];
              }
            } else {
              resolvedArgs[k] = v;
            }
          }
        }
        
        const toolCallId = `call_${Math.random().toString(36).substring(2, 9)}`;
        mockToolCalls.push({
          name: langChainToolName,
          args: resolvedArgs,
          id: toolCallId
        });
        
        console.log(`\x1b[1;34m  [Resilient Force] Running Post Tool ${langChainToolName}...\x1b[0m`);
        console.log(`\x1b[90m    Args: ${JSON.stringify(resolvedArgs)}\x1b[0m`);
        
        try {
          const output = await targetTool.invoke(resolvedArgs);
          const outStr = typeof output === "string" ? output : JSON.stringify(output);
          console.log(`\x1b[90m    Out: ${outStr.length > 200 ? outStr.substring(0, 200) + "..." : outStr}\x1b[0m`);
          
          toolMessages.push(
            new ToolMessage({
              name: langChainToolName,
              content: outStr,
              tool_call_id: toolCallId
            })
          );
        } catch (err: any) {
          console.log(`\x1b[31m  [Resilient Force Error] ${err.message}\x1b[0m`);
          toolMessages.push(
            new ToolMessage({
              name: langChainToolName,
              content: `Error: ${err.message}`,
              tool_call_id: toolCallId
            })
          );
        }
      }
      
      if (mockToolCalls.length > 0) {
        const mockAssistantMessage = new AIMessage({
          content: result.content,
          tool_calls: mockToolCalls
        });
        
        const finalUpdatedMessages = [...activeMessages, mockAssistantMessage, ...toolMessages];
        logSection("Executor Output (Resilient Post)", { frontmatter, bodyLength: content.length });
        
        const update = {
          taskOutputs: { ...state.taskOutputs, [taskId]: output },
          messages: finalUpdatedMessages
        };
        logState("EXIT (FALLBACK_RESILIENT_POST)", update);
        return update;
      }
    }

    // No tool calls: Task is fully executed!
    const output = String(result.content || "");
    const { frontmatter, content } = parseFrontmatter(output);
    
    if (Object.keys(frontmatter).length === 0) {
      console.log(`\n\x1b[1;31m⚠️  WARNING: Failed to parse frontmatter from LLM response!\x1b[0m`);
      console.log(`\x1b[90mRAW OUTPUT:\n${output.substring(0, 500)}...\x1b[0m`);
    }
    logSection("Executor Output", { frontmatter, bodyLength: content.length });

    const update = { 
      taskOutputs: { ...state.taskOutputs, [taskId]: output },
      messages: updatedMessages
    };
    logState("EXIT", update);
    return update;

  } catch (error: any) {
    logHeader(`TASK EXECUTION ERROR`, "31", "❌");
    console.error(`\x1b[31mError in ${taskId}: ${error.message}\x1b[0m`);
    
    console.log(`\n\x1b[1;33mHow would you like to proceed?\x1b[0m`);
    console.log(`1. \x1b[1mRetry\x1b[0m (Attempt the task again)`);
    console.log(`2. \x1b[1mSkip\x1b[0m (Proceed to next task without output)`);
    console.log(`3. \x1b[1mManual Inject\x1b[0m (Provide YAML output manually)`);
    
    const choice = await askQuestion("\n\x1b[1;35mSelect (1/2/3): \x1b[0m");

    if (choice === "1") {
      console.log(`\x1b[32mRe-triggering task ${taskId}...\x1b[0m`);
      return executeTaskNode(state); 
    } else if (choice === "3") {
      const manualYaml = await askQuestion("\n\x1b[1;35mPaste YAML frontmatter (no dashes): \x1b[0m");
      const manualBody = await askQuestion("\x1b[1;35mBrief summary of manual action: \x1b[0m");
      const output = `---\n${manualYaml}\n---\n${manualBody}`;
      return { taskOutputs: { ...state.taskOutputs, [taskId]: output } };
    } else {
      console.log(`\x1b[33mSkipping task ${taskId}...\x1b[0m`);
      return { taskOutputs: { ...state.taskOutputs, [taskId]: "---\nskip: true\n---\nTask skipped by user." } };
    }
  }
}

async function updateStateNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  const taskId = state.currentTask!;
  logHeader(`NODE: UPDATE [${taskId}]`, "32", "🔄");
  logState("ENTRY", state);

  const { frontmatter, content } = parseFrontmatter(state.taskOutputs[taskId]);
  const prep = state.taskPreparations[taskId];

  let resolvedEntities = { ...state.resolvedEntities };
  let gatheredContext = { ...state.gatheredContext };
  const updates: string[] = [];

  // Helper for falling back to markdown body for major multi-line text variables
  const getOutputValue = (key: string): any => {
    let val: any = frontmatter[key];
    const isMajorText = ["responseDraft", "supportSummary", "customerRequest", "issueContext", "documents", "humanFeedback", "pendingTickets"].includes(key);
    
    // Robust fallback prioritizing the markdown body if it's the actual email draft
    if (key === "responseDraft" && content.trim() !== "") {
      const trimmedBody = content.trim();
      const hasGreeting = trimmedBody.toLowerCase().includes("hello") || trimmedBody.toLowerCase().includes("dear") || trimmedBody.toLowerCase().includes("hi ");
      if (hasGreeting || val === undefined || val === "" || val === null || trimmedBody.length > (val || "").length) {
        val = trimmedBody;
      }
    }

    if ((val === undefined || val === "" || val === null) && isMajorText && content.trim() !== "") {
      val = content.trim();
    }

    if (key === "responseDraft" && val && typeof val === "string") {
      // Clean up accidental frontmatter leakage in responseDraft
      if (val.includes("---")) {
        val = val.replace(/^---[\s\S]*?---\n?/g, "");
      }
      if (val.includes("responseDraft:")) {
        val = val.replace(/^responseDraft:\s*(\||>)?\s*/g, "");
      }
      // Strip leading block scalar indentation spaces
      val = val.split("\n").map((line: string) => line.startsWith("  ") ? line.slice(2) : line).join("\n");
      val = val.trim();
    }

    // Double-safe JSON/array parsing for serialized lists/objects
    if (typeof val === "string") {
      const trimmed = val.trim();
      if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
        try {
          const jsonFriendly = trimmed.replace(/'/g, '"');
          val = JSON.parse(jsonFriendly);
        } catch {
          // ignore, keep as string
        }
      }
    }

    return val;
  };

  // 1. Expected State Updates from Planner
  (prep.stateUpdatesExpected || []).forEach((path: string) => {
    const parts = path.split(".");
    if (parts.length >= 2) {
      const target = parts[0];
      const key = parts[1];
      const val = getOutputValue(key);

      if (val !== undefined && val !== null) {
        if (target === "resolvedEntities") {
          resolvedEntities[key] = val;
          updates.push(`Entity (explicit): ${key}`);
        } else if (target === "gatheredContext") {
          gatheredContext[key] = val;
          updates.push(`Context (explicit): ${key}`);
        }
      }
    }
  });

  // 2. AUTOMATIC PERSISTENCE: If it was in expectedOutputSchema, and not already saved, save it to resolvedEntities
  const expectedKeys = Object.keys(prep.expectedOutputSchema || {});
  expectedKeys.forEach(key => {
    if (resolvedEntities[key] === undefined) {
      const val = getOutputValue(key);
      if (val !== undefined && val !== null) {
        resolvedEntities[key] = val;
        updates.push(`Entity (auto): ${key}`);
      }
    }
  });

  // 3. Context persistence (special case for body/content)
  if (prep.stateUpdatesExpected?.includes("gatheredContext.body")) {
    gatheredContext[taskId] = content;
    updates.push(`Context: ${taskId} (body)`);
  }

  if (updates.length > 0) {
    console.log(`\n\x1b[1;32m✅ State Updates:\x1b[0m\n  ${updates.join("\n  ")}`);
  } else {
    console.log(`\n\x1b[1;33m⚠️ No data was persisted. LLM failed to provide expected keys.\x1b[0m`);
  }

  let nextTask: string | undefined;
  // LOOP LOGIC: If human rejected, go back to drafting
  if (taskId === "review-customer-answer" && String(resolvedEntities.isApproved) === "false") {
    console.log(`\n\x1b[1;31m 🔁 [OS] Draft rejected. Looping back to "answer-customer-ticket" for revision...\x1b[0m`);
    nextTask = "answer-customer-ticket";
  } else {
    const currentIndex = state.workflow.tasks.indexOf(taskId);
    nextTask = state.workflow.tasks[currentIndex + 1];
  }

  const update = { resolvedEntities, gatheredContext, currentTask: nextTask, executionLog: [...state.executionLog, `Completed ${taskId}`], messages: [] };
  console.log(`\x1b[32m [OS] Task ${taskId} finished. Next: ${nextTask || "END"}\x1b[0m`);
  logState("EXIT", update);
  return update;
}

// ==========================================
// 7. OS BOOTSTRAP
// ==========================================
async function bootstrapOS() {
  logHeader("AGENT OS - BOOTSTRAPPING", "35", "⚙️");
  
  const companyContext = fs.readFileSync(path.join(__dirname, "company-context.md"), "utf-8");
  const teamContext = fs.readFileSync(path.join(__dirname, "team-context.md"), "utf-8");
  
  // Robust connector paths matching with optional colon and backticks
  const connectorPaths = [...teamContext.matchAll(/- .*?(\.\/connectors\/.*?\.md)/g)].map(m => m[1]);
  
  let connectorContexts = "";
  const actionMap: Record<string, string> = {};
  const connectorAdapters: Record<string, any> = {};

  for (const cp of connectorPaths) {
    const fullPath = path.join(__dirname, cp);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      connectorContexts += content + "\n\n";
      
      const actionRegex = /###\s+`?([a-zA-Z0-9_.]+)`?[\s\S]*?-\s+\*\*MCP Tool:\*\*\s+`?([a-zA-Z0-9_]+)`?/g;
      let match; 
      while ((match = actionRegex.exec(content)) !== null) {
        actionMap[match[1]] = match[2];
      }

      // Instantiate the semantic adapter using our factory
      const adapter = ConnectorFactory.createAdapter(fullPath);
      if (adapter) {
        let prefix = "ticketing";
        if (adapter.interfaceType === "ITicketingSystem") {
          prefix = "ticketing";
        } else if (adapter.interfaceType === "IProjectManager") {
          prefix = "project";
        } else if (adapter.interfaceType === "IKnowledgeBase") {
          prefix = "knowledge_base";
        }
        connectorAdapters[prefix] = adapter;
        console.log(`\x1b[32m[OS Bootstrap] Registered adapter of type "${adapter.interfaceType}" under prefix "${prefix}"\x1b[0m`);
      }
    }
  }

  const entryWorkflow = process.env.ENTRY_WORKFLOW || "ticket-triage";
  console.log(`\n\x1b[1;35m[OS] Launching Entry Workflow: ${entryWorkflow}\x1b[0m`);

  const initialEntities: Record<string, any> = {};
  if (process.env.LINEAR_ISSUE_ID) {
    initialEntities.ticketId = process.env.LINEAR_ISSUE_ID;
  }

  try {
    await runSubWorkflow(
      entryWorkflow,
      initialEntities,
      { companyContext, teamContext, connectorContexts, actionMap, connectorAdapters }
    );
    console.log("\n\x1b[1;32mDONE: Root workflow finished successfully!\x1b[0m");
  } catch (e) {
    console.error("Workflow Failed:", e);
  } finally {
    await closeLinearMcpConnection();
    rl.close();
  }
}

bootstrapOS();
