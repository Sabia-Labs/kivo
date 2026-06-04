import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { db } from "../../db/client";
import { tasks, requests, teams, integrations, agents } from "../../db/schema";
import { eq, and, ne, asc } from "drizzle-orm";
import { BaseMessage, SystemMessage, HumanMessage, ToolMessage, AIMessage } from "@langchain/core/messages";
import { ConnectorFactory } from "./integrations/factory";
import { getToolsForAdapters } from "./integrations/tools";
import { LLMFactory } from "./integrations/llm-factory";
import { runRequestContinuation } from "../../workflows/requestContinuation";
import { t, resolveWorkspaceLanguage } from "../../lib/i18n";

// ==========================================
// 1. STATE DEFINITION
// ==========================================
export const ExecutorState = Annotation.Root({
  taskId: Annotation<string>,
  taskRecord: Annotation<any>,
  requestRecord: Annotation<any>,
  companyContext: Annotation<string>,
  teamContext: Annotation<string>,
  connectorContexts: Annotation<string>,
  connectorAdapters: Annotation<Record<string, any>>,
  gatheredContext: Annotation<Record<string, any>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({})
  }),
  resolvedEntities: Annotation<Record<string, any>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({})
  }),
  executionLog: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => []
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => b.length === 0 ? [] : a.concat(b),
    default: () => []
  }),
  taskPreparations: Annotation<Record<string, any>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({})
  }),
  taskOutputs: Annotation<Record<string, any>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({})
  }),
  capabilityId: Annotation<string>
});

export type WorkflowState = typeof ExecutorState.State;

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
    taskId: state.taskId,
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

function extractExpectedOutputs(taskTemplate: string): Record<string, string> {
  const schema: Record<string, string> = {};
  
  // Match either with or without the EXPECTED OUTPUTS header
  const matchBlock = taskTemplate.match(/EXPECTED OUTPUTS\s*([\s\S]*?)(?=\r?\n#|##|$)/);
  const textToParse = matchBlock ? matchBlock[1] : taskTemplate;
  
  const lines = textToParse.split("\n");
  for (const line of lines) {
    const matchLine = line.match(/^\s*-\s*`?([a-zA-Z0-9_.-]+)`?\s*:\s*(.*)$/);
    if (matchLine) {
      schema[matchLine[1].trim()] = matchLine[2].trim();
    }
  }
  
  return schema;
}

async function queryLLM(systemPrompt: string, userPrompt: string, formatJson: boolean = true): Promise<any> {
  const plannerModel = LLMFactory.createModel("planner");
  try {
    const response = await plannerModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);
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
// 4. MAIN EXECUTOR ENTRYPOINT
// ==========================================
export async function runLangchainExecutor(taskId: string) {
  console.log(`[langgraph-executor] Starting executor for task: ${taskId}`);
  
  const [taskRecord] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!taskRecord) throw new Error(`Task ${taskId} not found`);

  const [requestRecord] = await db.select().from(requests).where(eq(requests.id, taskRecord.requestId!));
  if (!requestRecord) throw new Error(`Request ${taskRecord.requestId} not found`);

  const [team] = await db.select().from(teams).where(eq(teams.id, taskRecord.teamId));
  if (!team) throw new Error(`Team not found`);

  const teamAgents = await db.select().from(agents).where(eq(agents.teamId, team.id));
  
  // 1. Compile Context
  const companyContext = `Company AcmeFlow (Kivo Environment). Team: ${team.name}. Mission: ${team.mission}`;
  const teamContext = `Team Name: ${team.name}\nMission: ${team.mission}\nWays of Working: ${team.waysOfWorking || "Standard"}\nAgents:\n${teamAgents.map(a => `- ${a.name} (Role: ${a.roleId})`).join("\n")}`;

  const isHumanApproval = taskRecord.instructions?.includes("[CAPABILITY_TYPE: human_approval]");

  if (isHumanApproval) {
    console.log(`[langgraph-executor] Pausing task ${taskId} for human approval.`);
    const { notifications, workspaces } = await import("../../db/schema");
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId));
    
    const lang = await resolveWorkspaceLanguage(team.id);
    await db.insert(notifications).values({
      teamId: team.id,
      recipientId: requestRecord.requesterUserId || workspace?.userId || team.id,
      recipientType: "human",
      title: t("taskRequiresApproval", lang),
      content: t("approvalRequiredContent", lang, { title: taskRecord.title }),
      priority: "high",
      relatedEntityId: taskId,
      relatedEntityType: "task",
    });

    // We halt execution. The UI will resume by updating the task directly.
    return;
  }

  // 2. Connector Adapters
  const teamIntegrations = await db.select().from(integrations).where(eq(integrations.teamId, team.id));
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

  // Build a highly detailed, schema-aware connectorContexts dynamically from the actual tools
  const tools = getToolsForAdapters(connectorAdapters);
  let connectorContexts = "Available Connector Actions:\n";
  if (tools.length === 0) {
    connectorContexts += "No integrations configured.\n";
  } else {
    tools.forEach(t => {
      let dottedName = t.name;
      if (dottedName.startsWith("ticketing_")) dottedName = "ticketing." + dottedName.substring(10);
      else if (dottedName.startsWith("knowledge_base_")) dottedName = "knowledge_base." + dottedName.substring(15);
      else if (dottedName.startsWith("project_")) dottedName = "project." + dottedName.substring(8);
      else {
        const idx = dottedName.indexOf("_");
        if (idx !== -1) {
          dottedName = dottedName.substring(0, idx) + "." + dottedName.substring(idx + 1);
        }
      }

      connectorContexts += `\n- Action: "${dottedName}"\n`;
      connectorContexts += `  Description: ${t.description}\n`;

      const schema = t.schema;
      if (schema) {
        let properties: Record<string, any> = {};
        if (typeof schema.shape === "object") {
          properties = schema.shape;
        } else if (typeof schema.properties === "object") {
          properties = schema.properties;
        }
        
        const schemaLines: string[] = [];
        for (const [key, prop] of Object.entries(properties)) {
          const isRequired = !prop.isOptional?.();
          const desc = prop.description || "";
          schemaLines.push(`    - ${key} (${isRequired ? 'required' : 'optional'}): ${desc}`);
        }
        if (schemaLines.length > 0) {
          connectorContexts += `  Expected Inputs:\n${schemaLines.join("\n")}\n`;
        } else {
          connectorContexts += `  Expected Inputs: None\n`;
        }
      } else {
        connectorContexts += `  Expected Inputs: None\n`;
      }
    });
  }

  // Find capability template ID from the task index in workflow list
  const allTasksForRequest = await db.select().from(tasks)
    .where(eq(tasks.requestId, taskRecord.requestId!))
    .orderBy(asc(tasks.createdAt));
    
  const taskIndex = allTasksForRequest.findIndex(t => t.id === taskId);
  const capabilityId = requestRecord.capabilitiesWorkflow && taskIndex !== -1
    ? (requestRecord.capabilitiesWorkflow as string[])[taskIndex]
    : null;

  // Load previous successful tasks to rebuild resolvedEntities state variables
  const previousTasks = await db.select().from(tasks)
    .where(and(
      eq(tasks.requestId, taskRecord.requestId!),
      ne(tasks.id, taskId),
      eq(tasks.status, "success")
    ));

  const resolvedEntities: Record<string, any> = {};

  for (const pt of previousTasks) {
    if (pt.result) {
      const { frontmatter, content } = parseFrontmatter(pt.result);
      Object.keys(frontmatter).forEach(k => {
        resolvedEntities[k] = frontmatter[k];
      });
      // Force responseDraft resolution if Answer Customer Ticket succeeded
      if (pt.title?.includes("Answer Customer") && content.trim()) {
        resolvedEntities["responseDraft"] = content.trim();
      }
    }
  }

  // 3. Compile Graph
  const graph = new StateGraph(ExecutorState)
  .addNode("prepare", async (state: WorkflowState): Promise<Partial<WorkflowState>> => {
    const tid = state.taskId;
    const cid = state.capabilityId;
    logHeader(`NODE: PREPARE [${cid || tid}]`, "33", "📋");
    logState("ENTRY", state);

    // Call LLM Planner to create task instructions & expected schemas
    const systemPrompt = `You are the Workflow Architect (Planner). Your job is to bridge the Task Template with the current System State.

RULES:
1. DATA RESOLUTION: For every "REQUIRED INPUT" in the task, find its value.
   - Look in the "### STATE" (resolved entities).
   - If not present in "### STATE", try to extract the value from the "### TASK" context (Task Title, prompt, and template instructions) or "### ORIGINAL REQUEST" (Request Title, Details).
   - If present in either, map it to "resolvedInputs" and output the key-value pair.
   - If missing from both, set it to null. NEVER invent values that are not grounded in the task or state.
   - CRITICAL: Internal Kivo request identifiers (e.g., matching the prefix of the current team, such as SRE-1, PRD-2, etc.) are internal system framework IDs and MUST NOT be used as external ticket IDs (like ticketId). If you see a user-provided ticket parameter (like KVO-110) in the original request title or details, prefer that as the ticketId.
2. ACTION SELECTION & PARAMETER MAPPING: Pick ONLY the necessary actions from the "### CONNECTORS" list to fulfill the instructions.
   - For the "name" of the action, you MUST use the exact action identifier (e.g., "ticketing.get_details", "knowledge_base.search").
   - Match the parameters of the action by looking at "Expected Inputs" in the action's schema. The keys in the "input" object MUST match the expected schema parameter names EXACTLY.
   - Map each parameter to the correct key from "### STATE" (resolved entities) by prefixing its key name with "$".
   - Example: If the tool expects parameter "id" and the system state has "ticketId: KVO-110", output:
     "input": { "id": "$ticketId" }
     Do NOT output "input": { "ticketId": "$ticketId" } because "ticketId" is not the parameter expected by the tool's schema.
3. OUTPUT SCHEMA: Copy all "# EXPECTED OUTPUTS" from the task into "expectedOutputSchema".
4. EXECUTOR GUIDANCE: Rewrite instructions into a checklist.

Return ONLY a JSON object:
{ 
  "readiness": "ready", 
  "resolvedInputs": { "key": "value" }, 
  "selectedActions": [
    { 
      "name": "action.identifier", 
      "runPhase": "pre" | "post", 
      "reason": "...", 
      "input": { "param": "$stateVariable" } 
    }
  ], 
  "instructionsForExecutor": ["Step 1...", "..."], 
  "expectedOutputSchema": { "key": "description" } 
}`;

    const userPrompt = `### COMPANY:
${state.companyContext}
### TEAM:
${state.teamContext}
### CONNECTORS:
${state.connectorContexts}
### STATE:
${JSON.stringify(state.resolvedEntities, null, 2)}
### ORIGINAL REQUEST:
Request Title: ${state.requestRecord.title}
Request Details: ${state.requestRecord.requestDetails || "None"}
### TASK:
Task Title: ${state.taskRecord.title}
Template Instructions: ${state.taskRecord.instructions || ""}
Expected Outputs: ${(state.taskRecord as any)?.capability?.expectedOutputsDescription || ""}
Prompt: ${state.taskRecord.prompt || ""}`;

    logPrompt(`PLANNER [${cid || tid}]`, systemPrompt, userPrompt);
    
    let payload: any;
    try {
      payload = await queryLLM(systemPrompt, userPrompt);
    } catch (err: any) {
      console.log(`\n\x1b[33m⚠️ [Planner Fallback] Small-LLM JSON parser error: ${err.message}. Using default structured payload.\x1b[0m`);
      payload = {
        readiness: "ready",
        resolvedInputs: {},
        selectedActions: [],
        instructionsForExecutor: [state.taskRecord.instructions || ""],
        expectedOutputSchema: {}
      };
    }

    // Deterministically overwrite expectedOutputSchema to avoid LLM extraction errors
    const expectedOutputsDesc = (state.taskRecord as any)?.capability?.expectedOutputsDescription || "";
    const instructionsToParse = expectedOutputsDesc ? `EXPECTED OUTPUTS\n${expectedOutputsDesc}` : (state.taskRecord.instructions || "");
    const parsedExpected = extractExpectedOutputs(instructionsToParse);
    if (Object.keys(parsedExpected).length > 0) {
      payload.expectedOutputSchema = parsedExpected;
    }

    // Resolve deterministic metadata overrides dynamically from instructions
    const tools = getToolsForAdapters(state.connectorAdapters);
    const genericActions = buildGenericActions(state.taskRecord.instructions || "", tools);
    if (genericActions.length > 0) {
      const existingNames = new Set((payload.selectedActions || []).map((a: any) => a.name));
      payload.selectedActions = [
        ...(payload.selectedActions || []),
        ...genericActions.filter(ga => !existingNames.has(ga.name))
      ];
    }

    const requiredInputs = extractRequiredInputs(state.taskRecord.instructions || "");
    payload.resolvedInputs = payload.resolvedInputs || {};
    for (const inputKey of requiredInputs) {
      if (payload.resolvedInputs[inputKey] === undefined) {
        if (state.resolvedEntities[inputKey] !== undefined) {
          payload.resolvedInputs[inputKey] = `$${inputKey}`;
        }
      }
    }

    // Normalize selectedActions
    if (payload.selectedTools) {
      payload.selectedActions = payload.selectedTools;
    } else if (payload.selectedActions) {
      payload.selectedTools = payload.selectedActions;
    }

    logSection("Planned Actions", {
      actions: payload.selectedActions?.map((t: any) => `${t.runPhase}: ${t.name} ${t.reason ? `(${t.reason})` : ""}`),
      inputs: payload.resolvedInputs,
      expecting: payload.expectedOutputSchema
    });

    const updatedResolved = { ...state.resolvedEntities };
    if (payload.resolvedInputs) {
      Object.entries(payload.resolvedInputs).forEach(([k, v]) => {
        let resolvedVal = v;
        if (typeof v === "string" && v.startsWith("$")) {
          const stateKey = v.slice(1);
          resolvedVal = state.resolvedEntities[stateKey];
          if (resolvedVal === undefined || resolvedVal === null) {
            if (k === "customerName") resolvedVal = "Customer";
            else resolvedVal = "";
          }
        }
        if (resolvedVal !== null && resolvedVal !== undefined && resolvedVal !== "") {
          updatedResolved[k] = resolvedVal;
        }
      });
    }

    const update = {
      taskPreparations: { ...state.taskPreparations, [cid || tid]: payload },
      resolvedEntities: updatedResolved
    };
    logState("EXIT", update);
    return update;
  })
  .addNode("execute", async (state: WorkflowState): Promise<Partial<WorkflowState>> => {
    const tid = state.taskId;
    const cid = state.capabilityId;
    logHeader(`NODE: EXECUTE [${cid || tid}]`, "34", "🧠");
    logState("ENTRY", state);

    const prep = state.taskPreparations[cid || tid];
    const activeMessages = [...state.messages];

    // If first turn, frame prompts
    if (activeMessages.length === 0) {
      // Resolve workspace language once — only the final user-facing markdown body must respect it
      const lang = await resolveWorkspaceLanguage(state.taskRecord?.teamId);
      const langName = lang === "pt" ? "Portuguese (Brazil)" : lang === "zh" ? "Chinese (Simplified)" : "English";

      const systemPrompt = `You are a specialized enterprise AI agent. You must execute your assigned task according to your role identity and company policies.

### COMPANY CONTEXT & COMMUNICATION POLICY:
${state.companyContext}

### TEAM CONTEXT:
${state.teamContext}

### LANGUAGE CONSTRAINT:
You must always write your final user-facing response in ${langName}.
The language of the user input, tool results, parameters, or intermediate reasoning is irrelevant.
Only the final markdown content body (after the closing '---' of the YAML block) must be written in ${langName}.
Do not switch languages unless explicitly instructed.

### INSTRUCTIONS:
1. Undergo the task carefully and methodically.
2. Ground your facts ONLY in the provided EVIDENCE. Do NOT invent, hallucinate, or guess any outside details.
3. Maintain the precise tone and vibe expected.
4. You have access to native tools. If you need information, CALL the appropriate tool. If a tool fails or returns no data, explicitly state in your final response that the information could not be found. Do NOT make up answers.
5. Once you have all the information and have completed the task, you MUST start your final response with a YAML frontmatter block between '---' lines.
6. The YAML block MUST contain ONLY the keys requested under "MANDATORY KEYS".
7. After the closing '---' of the YAML block, provide the main markdown content body (e.g., your drafted response, analysis, or summary) in ${langName}.

Example Output Format:
---
keyName1: value1
keyName2: value2
---
### Main Markdown Content Body
[Your markdown content goes here in ${langName}]`;

      const userPrompt = `### TASK CHECKLIST:
${prep.instructionsForExecutor ? prep.instructionsForExecutor.join("\n") : state.taskRecord.instructions}

### STATE EVIDENCE:
${JSON.stringify(state.resolvedEntities, null, 2)}

### MANDATORY KEYS (You MUST return these keys in the YAML frontmatter):
${Object.keys(prep.expectedOutputSchema || {}).join(", ")}`;

      activeMessages.push(new SystemMessage(systemPrompt));
      activeMessages.push(new HumanMessage(userPrompt));
      
      logPrompt(`EXECUTOR [${cid || tid}]`, systemPrompt, userPrompt);
    }

    const llm = LLMFactory.createModel("executor");
    const selectedActionNames = new Set(
      (prep.selectedActions || []).map((a: any) => a.name.replace(/\./g, "_"))
    );
    const tools = getToolsForAdapters(state.connectorAdapters).filter(t => 
      selectedActionNames.has(t.name)
    );
    
    let result;
    if (tools.length > 0) {
      if (typeof (llm as any).bindTools !== "function") {
        throw new Error(`The selected executor model provider does not support tool calling.`);
      }
      const llmWithTools = (llm as any).bindTools(tools);
      console.log(`\n\x1b[1;36m▶ Querying Brain (LLM tool calling)... \x1b[0m`);
      result = await llmWithTools.invoke(activeMessages);
    } else {
      console.log(`\n\x1b[1;36m▶ Querying Brain (LLM text-only)... \x1b[0m`);
      result = await llm.invoke(activeMessages);
    }
    const updatedMessages = [...activeMessages, result];

    const toolCalls = (result as any).tool_calls;
    const hasToolCalls = !!(toolCalls && toolCalls.length > 0);

    if (hasToolCalls) {
      console.log(`\x1b[35m  [Agent Brain] Emitted ${toolCalls.length} native tool call(s).\x1b[0m`);
      const update = { messages: updatedMessages };
      logState("EXIT (TOOL_CALL_ROUTE)", update);
      return update;
    }

    // Pre-LLM resilient tool fallback
    const isFirstTurn = activeMessages.length === 2; // System + Human
    const preTools = prep.selectedActions?.filter((t: any) => t.runPhase === "pre") || [];

    if (!hasToolCalls && isFirstTurn && preTools.length > 0) {
      console.log(`\x1b[33m  [Executor Resilient Fallback] LLM failed to emit tool calls. Executing Pre-LLM tools...\x1b[0m`);
      
      const mockToolCalls: any[] = [];
      const toolMessages: BaseMessage[] = [];

      for (const pt of preTools) {
        const langChainToolName = pt.name.replace(/\./g, "_");
        const targetTool = tools.find(t => t.name === langChainToolName);
        if (!targetTool) {
          const lang = await resolveWorkspaceLanguage(state.taskRecord?.teamId);
          throw new Error(t("integrationMissing", lang, { tool: langChainToolName }));
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
        const mockAssistantMessage = new AIMessage({
          content: "",
          tool_calls: mockToolCalls
        });

        const fallbackMessages = [...activeMessages, mockAssistantMessage, ...toolMessages];
        
        console.log(`\x1b[35m  [Executor Resilient Fallback] Querying Brain with clean data extraction model...\x1b[0m`);

        const extractionSystem = `You are a precise technical data extraction assistant.
Analyze the tool outputs below and extract the requested fields.
CRITICAL RULES:
1. If the TOOL OUTPUTS do not contain sufficient information to fill a field, you MUST set its value to "No relevant information found" or an empty array.
2. Do NOT invent, hallucinate, or guess any information under any circumstances.
3. You MUST respond with a single valid JSON object.
4. Do NOT output any conversational text or markdown codeblocks outside of the JSON.`;

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

        // Format parsedOutput as YAML frontmatter
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
          taskOutputs: { ...state.taskOutputs, [cid || tid]: output },
          messages: [...fallbackMessages, new AIMessage(output)]
        };
        logState("EXIT (FALLBACK_RESILIENT)", update);
        return update;
      }
    }

    // Post-LLM resilient tool fallback
    const postTools = prep.selectedActions?.filter((t: any) => t.runPhase === "post") || [];
    if (!hasToolCalls && postTools.length > 0) {
      console.log(`\x1b[33m  [Executor Resilient Fallback] LLM did not call post tools natively. Executing Post-LLM tools...\x1b[0m`);

      const mockToolCalls: any[] = [];
      const toolMessages: BaseMessage[] = [];

      const output = String(result.content || "");
      const { frontmatter, content } = parseFrontmatter(output);

      const tempResolved = { ...state.resolvedEntities };
      if (content.trim()) {
        tempResolved["responseDraft"] = content.trim();
      }
      Object.keys(frontmatter).forEach(k => {
        tempResolved[k] = frontmatter[k];
      });

      for (const pt of postTools) {
        const langChainToolName = pt.name.replace(/\./g, "_");
        const targetTool = tools.find(t => t.name === langChainToolName);
        if (!targetTool) {
          const lang = await resolveWorkspaceLanguage(state.taskRecord?.teamId);
          throw new Error(t("integrationMissing", lang, { tool: langChainToolName }));
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
          taskOutputs: { ...state.taskOutputs, [cid || tid]: output },
          messages: finalUpdatedMessages
        };
        logState("EXIT (FALLBACK_RESILIENT_POST)", update);
        return update;
      }
    }

    // Default response
    const output = String(result.content || "");
    const { frontmatter, content } = parseFrontmatter(output);
    logSection("Executor Output", { frontmatter, bodyLength: content.length });

    const update = {
      taskOutputs: { ...state.taskOutputs, [cid || tid]: output },
      messages: updatedMessages
    };
    logState("EXIT", update);
    return update;
  })
  .addNode("tools", async (state: WorkflowState): Promise<Partial<WorkflowState>> => {
    console.log(`[langgraph-executor] TOOLS`);
    const lastMessage = state.messages[state.messages.length - 1] as any;
    const toolCalls = lastMessage?.tool_calls || [];
    
    if (!toolCalls || toolCalls.length === 0) return {};

    const tools = getToolsForAdapters(state.connectorAdapters);
    const newMessages: BaseMessage[] = [];

    for (const tc of toolCalls) {
      const targetTool = tools.find(t => t.name === tc.name);
      if (!targetTool) {
        newMessages.push(new ToolMessage({ name: tc.name, content: `Error: Tool not found`, tool_call_id: tc.id }));
        continue;
      }
      try {
        const output = await targetTool.invoke(tc.args);
        newMessages.push(new ToolMessage({ name: tc.name, content: typeof output === "string" ? output : JSON.stringify(output), tool_call_id: tc.id }));
      } catch (err: any) {
        console.error(`[langgraph-executor] Tool ${tc.name} execution failed:`, err);
        throw new Error(`Tool ${tc.name} failed: ${err.message}`);
      }
    }
    return { messages: newMessages };
  })
  .addNode("update", async (state: WorkflowState): Promise<Partial<WorkflowState>> => {
    const tid = state.taskId;
    const cid = state.capabilityId;
    logHeader(`NODE: UPDATE [${cid || tid}]`, "32", "🔄");
    logState("ENTRY", state);

    const prep = state.taskPreparations[cid || tid];
    const taskOutput = state.taskOutputs[cid || tid];
    
    if (!taskOutput) {
      throw new Error(`Task output empty for capability: ${cid}`);
    }

    const { frontmatter, content } = parseFrontmatter(taskOutput);
    const expectedKeys = Object.keys(prep.expectedOutputSchema || {});

    // Validate expected outputs
    const missingKeys: string[] = [];
    const tempResolved = { ...state.resolvedEntities };
    
    expectedKeys.forEach(k => {
      let val = frontmatter[k];
      if (k === "responseDraft" && content.trim()) {
        val = content.trim();
      }

      const isInvalid = (v: any) => {
        if (v === undefined || v === null) return true;
        const s = String(v).trim().toLowerCase();
        return s === "" || s === "null" || s === "none" || s === "undefined";
      };

      if (isInvalid(val)) {
        missingKeys.push(k);
      } else {
        tempResolved[k] = val;
      }
    });

    if (missingKeys.length > 0) {
      console.warn(`\x1b[31m[UPDATE] Validation failed. Missing keys: ${missingKeys.join(", ")}\x1b[0m`);
      
      await db.update(tasks).set({
        status: "failed",
        failureReason: `Task completed but validation failed. Missing expected keys: ${missingKeys.join(", ")}`,
        updatedAt: new Date()
      }).where(eq(tasks.id, tid));

      return {};
    }

    console.log(`\x1b[32m[UPDATE] Validation succeeded! Expected outputs resolved: ${expectedKeys.join(", ")}\x1b[0m`);

    const planText = content.substring(0, 1000) || "Plan executed programmatically.";
    const workSummaryText = "Task executed and outputs resolved.";

    // Save to task in DB
    await db.update(tasks).set({
      status: "success",
      plan: planText,
      taskList: expectedKeys.map(k => `- [x] ${k}`).join("\n"),
      workSummary: workSummaryText,
      result: taskOutput, // Raw frontmatter output
      updatedAt: new Date()
    }).where(eq(tasks.id, tid));

    return { resolvedEntities: tempResolved };
  })
  .addEdge(START, "prepare")
  .addEdge("prepare", "execute")
  .addConditionalEdges("execute", (state) => {
    const lastMsg = state.messages[state.messages.length - 1] as any;
    const toolCalls = lastMsg?.tool_calls || lastMsg?.additional_kwargs?.tool_calls;
    return toolCalls && toolCalls.length > 0 ? "tools" : "update";
  })
  .addEdge("tools", "execute")
  .addEdge("update", END);

  const compiledGraph = graph.compile();

  try {
    const initialState: WorkflowState = {
      taskId,
      taskRecord,
      requestRecord,
      companyContext,
      teamContext,
      connectorContexts,
      connectorAdapters,
      gatheredContext: {},
      resolvedEntities,
      executionLog: [],
      messages: [],
      taskPreparations: {},
      taskOutputs: {},
      capabilityId: capabilityId || ""
    };

    await compiledGraph.invoke(initialState);
    console.log(`[langgraph-executor] Task ${taskId} successfully executed.`);

    // Programmatically trigger continuation
    console.log(`[langgraph-executor] Triggering request continuation for task: ${taskId}`);
    runRequestContinuation(taskId, taskRecord.requestId!, taskRecord.teamId).catch(err => {
      console.error(`[langgraph-executor] Failed to run request continuation:`, err);
    });
  } catch (err: any) {
    console.error(`[langgraph-executor] Error running graph:`, err);
    const lang = await resolveWorkspaceLanguage(taskRecord.teamId);
    await db.update(tasks).set({
      status: "failed",
      result: t("workflowExecutionError", lang, { reason: err.message }),
      failureReason: err.message,
      updatedAt: new Date()
    }).where(eq(tasks.id, taskId));

    // Programmatically trigger continuation on failure
    console.log(`[langgraph-executor] Triggering request continuation for task failure: ${taskId}`);
    runRequestContinuation(taskId, taskRecord.requestId!, taskRecord.teamId).catch(continuationErr => {
      console.error(`[langgraph-executor] Failed to run request continuation on error:`, continuationErr);
    });
  }
}

function buildGenericActions(instructions: string, tools: any[]): any[] {
  const selectedActions: any[] = [];
  
  // Find all backticked dotted identifiers (e.g. `knowledge_base.search`)
  const matches = [...instructions.matchAll(/`([a-z0-9_]+\.[a-z0-9_]+)`/g)].map(m => m[1]);
  const uniqueMatches = Array.from(new Set(matches));

  const requiredInputs = extractRequiredInputs(instructions);

  for (const dottedName of uniqueMatches) {
    const langChainToolName = dottedName.replace(/\./g, "_");
    const targetTool = tools.find(t => t.name === langChainToolName);
    if (!targetTool) continue;
    
    // Determine runPhase based on name
    const lowerName = dottedName.toLowerCase();
    const isPost = lowerName.includes("update") || 
                   lowerName.includes("add") || 
                   lowerName.includes("send") || 
                   lowerName.includes("reply") || 
                   lowerName.includes("create") || 
                   lowerName.includes("delete");
    const runPhase = isPost ? "post" : "pre";
    
    // Resolve inputs dynamically by looking up tool schema parameters
    const input: Record<string, any> = {};
    
    // Try to get schema properties from targetTool
    const schema = (targetTool as any).schema;
    let schemaProperties: Record<string, any> = {};
    if (schema && typeof schema.shape === "object") {
      schemaProperties = schema.shape;
    } else if (schema && typeof schema.properties === "object") {
      schemaProperties = schema.properties;
    }
    
    for (const param of Object.keys(schemaProperties)) {
      // Generic substring overlap matching between expected tool parameters and required capability inputs
      const matchedInput = requiredInputs.find((inputKey: string) => {
        const normKey = inputKey.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normParam = param.toLowerCase().replace(/[^a-z0-9]/g, "");
        return normKey.includes(normParam) || normParam.includes(normKey);
      });

      if (matchedInput) {
        input[param] = `$${matchedInput}`;
      } else if (param === "query") {
        input[param] = "$customerRequest";
      } else if (param === "body" || param === "content") {
        input[param] = "$responseDraft";
      } else {
        input[param] = `$${param}`;
      }
    }
    
    selectedActions.push({
      name: dottedName,
      runPhase,
      reason: `Execute ${dottedName} tool`,
      input
    });
  }
  
  return selectedActions;
}

function extractRequiredInputs(instructions: string): string[] {
  const inputsSection = instructions.match(/#(?: REQUIRED)? INPUTS\s*([\s\S]*?)(?:#|$)/i);
  if (!inputsSection) return [];
  const matches = [...inputsSection[1].matchAll(/-\s*`([^`]+)`/g)].map(m => m[1]);
  return matches;
}
