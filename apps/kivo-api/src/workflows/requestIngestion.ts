import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { db } from "../db/client";
import {
  requests, teams, workspaces, agents, teamCapabilities, tasks,
  comments, notifications, conversations, messages
} from "../db/schema";
import { eq, and, ne } from "drizzle-orm";
import { completeRequest, requireMoreInfoFromUser, addCommentToRequest, updateRequest } from "../controllers/requestsController";
import { createCandidateCapability, getCapabilitiesByTeam, getCapabilityByIdentifier } from "../controllers/capabilitiesController";
import { createTaskAndNotifyAgent } from "../controllers/tasksController";
import { getAgentsByTeam } from "../controllers/agentsController";
import { getTeamById, getOtherTeamsInWorkspace } from "../controllers/teamsController";
import { LLMFactory } from "./langgraph/integrations/llm-factory";
import { resolveWorkspaceLanguage, t } from "../lib/i18n";

async function getLlm(teamId: string): Promise<any> {
  return await LLMFactory.createModel("orchestrator", { teamId });
}

const IngestionState = Annotation.Root({
  requestId: Annotation<string>,
  teamId: Annotation<string>,
  request: Annotation<any>,

  kivoContext: Annotation<string>,
  teamContext: Annotation<string>,
  otherTeamsContext: Annotation<string>,
  capabilitiesSummary: Annotation<string>,

  classification: Annotation<{
    isKivoRelated: boolean;
    isOtherTeamRelated: boolean;
    isTeamRelated: boolean;
    otherTeamIdentifier?: string;
    nature?: "inquiry" | "analysis" | "execution" | "project";
  }>,

  capability: Annotation<any>,
  assignedAgentId: Annotation<string>,
  taskPrompt: Annotation<string>,
  taskInstructions: Annotation<string>,
});

async function fetchContextsNode(state: typeof IngestionState.State) {
  console.log(`[request-ingestion] Node: fetchContexts. Request ID: ${state.requestId}`);
  const [requestRecord] = await db.select().from(requests).where(eq(requests.id, state.requestId));
  const team = await getTeamById(state.teamId);
  if (!team) throw new Error("Team not found");

  const kivoContext = "Kivo is a platform for deploying and managing autonomous AI developers as containers in a Kubernetes cluster. These agents act as full-stack developers, with state/memory persisted in Git for portability and interaction via Telegram.";

  const teamAgents = await getAgentsByTeam(state.teamId);
  const teamContext = `Team Name: ${team.name}\nMission: ${team.mission}\nAgents:\n${teamAgents.map(a => `- ${a.name} (Role: ${a.roleId}, ID: ${a.id})`).join("\n")}`;
  // TODO: inserir as integracoes que o time tem (github repo, linear, etc)

  const otherTeams = await getOtherTeamsInWorkspace(team.workspaceId, state.teamId);
  let otherTeamsContext = "No other teams.";
  if (otherTeams.length > 0) {
    const otherTeamsInfo = await Promise.all(otherTeams.map(async ot => {
      const otAgents = await getAgentsByTeam(ot.id);
      const teamLeaders = otAgents.filter(a => a.roleId?.includes("lead") || a.roleId?.includes("manager") || a.roleId === "executive-assistant");
      const leaderNames = teamLeaders.map(l => l.name).join(", ");
      return `- ${ot.name} (Prefix: ${ot.identifierPrefix}): Mission: ${ot.mission}. Leaders: ${leaderNames || "None"}`;
    }));
    otherTeamsContext = otherTeamsInfo.join("\n");
  }

  const capabilities = await getCapabilitiesByTeam(state.teamId);
  const capabilitiesSummary = capabilities.map(c => `- ${c.name} (${c.identifier})`).join("\n");

  console.log(`[request-ingestion] Node: fetchContexts. 
    Request ID: ${state.requestId}
    Returning...
    \nkivoContext: ${kivoContext}
    \nteamContext: ${teamContext}
    \notherTeamsContext: ${otherTeamsContext}
    \nSummary of what this team can do: ${capabilitiesSummary}`);
  const requestState = [
    `Kivo Application Context:\n${kivoContext}`,
    `Team Context:\n${teamContext}`,
    `Other Teams Context:\n${otherTeamsContext}`,
    `Summary of what this team can do:\n${capabilitiesSummary}`
  ];

  await updateRequest(state.requestId, { state: requestState });

  return {
    request: requestRecord,
    kivoContext,
    teamContext,
    otherTeamsContext,
    capabilitiesSummary
  };
}

const classificationSchema = z.object({
  isKivoRelated: z.boolean().describe("Whether the request is related to Kivo or the teams in the workspace."),
  isOtherTeamRelated: z.boolean().describe("Whether the request is meant for a team other than the current one."),
  isTeamRelated: z.boolean().describe("Whether the request is meant for the current team."),
  otherTeamIdentifier: z.string().optional().nullable().describe("If isOtherTeamRelated is true, provide the prefix or name of the other team.")
});

async function classifyRequestNode(state: typeof IngestionState.State) {
  console.log(`[request-ingestion] Node: classifyRequest. Request ID: ${state.requestId}`);
  const prompt = `Classify the following request based on the context provided.
  Request Title: ${state.request.title}
  Request Details: ${state.request.requestDetails || "None"}
  
  Context:
  Kivo Context: ${state.kivoContext}
  Current Team Context: ${state.teamContext}
  You must respond ONLY with a valid JSON object matching this exact schema:
  {
    "isKivoRelated": boolean,
    "isOtherTeamRelated": boolean,
    "isTeamRelated": boolean,
    "otherTeamIdentifier": string | null
  }`;

  const structuredLlm = (await getLlm(state.teamId)).withStructuredOutput(classificationSchema, { method: "jsonMode", name: "Classification" });
  const result = await structuredLlm.invoke(prompt);

  return { classification: result };
}

async function genericAnswerNode(state: typeof IngestionState.State) {
  console.log(`[request-ingestion] Node: genericAnswer. Request ID: ${state.requestId}`);

  // Resolve workspace language to enforce configured language in user-facing response
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

  const prompt = `${langBlock}

The user asked a generic question not related to our platform. Answer it politely in ${langName}.
Request Title: ${state.request.title}
Request Details: ${state.request.requestDetails || ""}

[REMINDER: Respond in ${langName} ONLY]`;
  
  const response = await (await getLlm(state.teamId)).invoke(prompt);
  const answer = response.content as string;

  await completeRequest(state.requestId, "success", answer);

  return {};
}

async function otherTeamRoutingNode(state: typeof IngestionState.State) {
  console.log(`[request-ingestion] Node: otherTeamRouting. Request ID: ${state.requestId}`);
  const lang = await resolveWorkspaceLanguage(state.teamId);
  const answer = t("otherTeamRoutingResponse", lang, { otherTeam: state.classification.otherTeamIdentifier || "unknown" });
  await completeRequest(state.requestId, "success", answer);
  return {};
}

const capabilityMatchSchema = z.object({
  matchedCapabilityIdentifier: z.string().optional().nullable().describe("The identifier of the matched capability, if any."),
  createNew: z.boolean().describe("Whether a new capability should be created."),
  newCapabilityName: z.string().optional().nullable().describe("If createNew is true, the name of the new capability."),
  newCapabilityIdentifier: z.string().optional().nullable().describe("If createNew is true, a machine-readable identifier (e.g. do-something)."),
  newCapabilityInstructions: z.string().optional().nullable().describe("If createNew is true, the instructions for the capability."),
  newCapabilityInputsDescription: z.string().optional().nullable().describe("If createNew is true, what inputs are required to execute this capability."),
  newCapabilityExpectedOutputs: z.string().optional().nullable().describe("If createNew is true, what is the Definition of Done or the expected outputs/artifacts."),
  newCapabilityAssignedRole: z.string().optional().nullable().describe("If createNew is true, which agent role from the team is best suited to execute this capability.")
});

async function getTeamCapabilityNode(state: typeof IngestionState.State) {
  console.log(`[request-ingestion] Node: getTeamCapability. Request ID: ${state.requestId}`);

  if (state.request.capabilitiesWorkflow && Array.isArray(state.request.capabilitiesWorkflow) && state.request.capabilitiesWorkflow.length > 0) {
    const capabilityIdentifier = state.request.capabilitiesWorkflow[0];
    let capability = await getCapabilityByIdentifier(state.teamId, capabilityIdentifier);
    if (capability) {
      if (capability.type === "workflow") {
        const tasksWorkflow = capability.tasksWorkflow as string[] || [];
        await updateRequest(state.requestId, { capabilitiesWorkflow: tasksWorkflow });
        if (tasksWorkflow.length > 0) {
          const firstTask = await getCapabilityByIdentifier(state.teamId, tasksWorkflow[0]);
          if (firstTask) capability = firstTask;
        }
      }
      console.log(`[request-ingestion] Request already has capability: ${capability.identifier}`);
      return { capability };
    }
  }

  const prompt = `Find the best team capability to fulfill the request.
  
  Request Title: ${state.request.title}
  Request Details: ${state.request.requestDetails || ""}
  
  Team Context (Agents and Roles):
  ${state.teamContext}
  
  Current Team Capabilities:
  ${state.capabilitiesSummary}
  
  If an existing capability matches well, use it. If not, suggest creating a NEW generic and reusable capability.
  
  CRITICAL INSTRUCTIONS FOR NEW CAPABILITIES:
  1. Make the capability GENERIC and REUSABLE. It should be a broad function or deliverable the team can produce, not a hyper-specific task. For example, instead of "Create endpoint to sum 2 numbers", create "Develop REST API Endpoint" or "Implement Backend Function".
  2. It must match the actual competences (roles) of the team members listed in the Team Context.
  3. Clearly define the inputs required to perform the capability in 'inputsDescription'.
  4. Clearly define the expected outputs or Definition of Done in 'expectedOutputs'.
  You must respond ONLY with a valid JSON object matching this exact schema:
  {
    "matchedCapabilityIdentifier": string | null,
    "createNew": boolean,
    "newCapabilityName": string | null,
    "newCapabilityIdentifier": string | null,
    "newCapabilityInstructions": string | null,
    "newCapabilityInputsDescription": string | null,
    "newCapabilityExpectedOutputs": string | null,
    "newCapabilityAssignedRole": string | null
  }`;

  const structuredLlm = (await getLlm(state.teamId)).withStructuredOutput(capabilityMatchSchema, { method: "jsonMode", name: "CapabilityMatch" });
  const result = await structuredLlm.invoke(prompt);

  console.log("[request-ingestion] capability match result: ", result);

  let capability;
  if (result.createNew && result.newCapabilityIdentifier) {
    capability = await createCandidateCapability(
      state.teamId,
      result.newCapabilityName || "New Capability",
      result.newCapabilityIdentifier,
      result.newCapabilityInstructions || "",
      "task_template",
      result.newCapabilityInputsDescription || "",
      result.newCapabilityExpectedOutputs || "",
      result.newCapabilityAssignedRole || ""
    );
  } else if (result.matchedCapabilityIdentifier) {
    const matchedCapability = await getCapabilityByIdentifier(state.teamId, result.matchedCapabilityIdentifier);
    if (matchedCapability) {
      capability = matchedCapability;
    }
  }

  // Fallback if something went wrong
  if (!capability) {
    const caps = await getCapabilitiesByTeam(state.teamId);
    if (caps.length > 0) {
      capability = caps[0];
    }
  }

  if (capability) {
    if (capability.type === "workflow") {
      const tasksWorkflow = capability.tasksWorkflow as string[] || [];
      await updateRequest(state.requestId, { capabilitiesWorkflow: tasksWorkflow });
      if (tasksWorkflow.length > 0) {
        const firstTask = await getCapabilityByIdentifier(state.teamId, tasksWorkflow[0]);
        if (firstTask) capability = firstTask;
      }
    } else {
      await updateRequest(state.requestId, { capabilitiesWorkflow: [capability.identifier] });
    }
  }

  return { capability };
}

async function prepareTaskNode(state: typeof IngestionState.State) {
  console.log(`[request-ingestion] Node: prepareTask. Request ID: ${state.requestId}`);

  const taskPrompt = state.request.requestDetails || state.request.title;
  
  let taskInstructions = state.capability?.instructions || "";
  if (state.capability?.inputsDescription) {
    taskInstructions += `\n- **Required Inputs:** ${state.capability.inputsDescription}`;
  }
  if (state.capability?.expectedOutputsDescription) {
    taskInstructions += `\n- **Expected Outputs:** ${state.capability.expectedOutputsDescription}`;
  }

  console.log(`[request-ingestion] Node: prepareTask. 
    Request ID: ${state.requestId}
    Returning static instructions to bypass LLM rewriting.`);

  return { taskPrompt, taskInstructions };
}

const agentAssignmentSchema = z.object({
  assignedAgentId: z.string().uuid().describe("The UUID of the agent best suited to perform the task.")
});

async function assignAgentNode(state: typeof IngestionState.State) {
  console.log(`[request-ingestion] Node: assignAgent. Request ID: ${state.requestId}`);
  if (state.capability?.assignedAgentId) {
    return { assignedAgentId: state.capability.assignedAgentId };
  }

  const preferredRole = state.capability?.assignedRole || "None";
  const prompt = `Select the best agent to execute this capability based on the team context.
  Capability: ${state.capability?.name} - ${state.capability?.instructions}
  Preferred Agent Role for this Capability: ${preferredRole}

  Team Agents:
  ${state.teamContext}

  CRITICAL SELECTION RULE:
  If a Preferred Agent Role is specified and is not "None", you MUST look for an agent in the Team Agents list whose Role (roleId) exactly matches this Preferred Agent Role (for example, if Preferred Agent Role is "support-responder", select the agent with Role "support-responder").
  You must respond ONLY with a valid JSON object matching this exact schema:
  {
    "assignedAgentId": string
  }`;

  const structuredLlm = (await getLlm(state.teamId)).withStructuredOutput(agentAssignmentSchema, { method: "jsonMode", name: "AgentAssignment" });
  const result = await structuredLlm.invoke(prompt);

  return { assignedAgentId: result.assignedAgentId };
}

async function createTaskNode(state: typeof IngestionState.State) {
  console.log(`[request-ingestion] Node: createTask. Request ID: ${state.requestId}`);

  const agentTaskWorkflowInstructions = `
---
CRITICAL TASK WORKFLOW INSTRUCTIONS:
You are executing a Task. You must process it following this standard workflow:
1. INPUT: Use the 'title', 'prompt', and 'context' fields to understand the request. Respect all specific 'instructions'.
2. EXECUTION: Provide a brief rationale of your actions in the 'workSummary' field. If you successfully accomplished the requested task, populate the 'result' field with the final deliverable/outcome. If the task failed or you could not complete it, got blocked or whatever reason you did not proceed, then you MUST populate the 'failureReason' field with a detailed description of the error, blocker, or why you could not execute it. In whatever situation you MUST ALWAYS finish by updating the task 'status' field with 'success' or 'failed'. If the task was completed satisfactorily, you MUST set 'status' to 'success'. If you are in doubt, encounter a blocker, or are unable to execute the requested actions, you MUST set 'status' to 'failed' to signal the failure. Do not leave the task open; it must be resolved.`;

  const finalInstructions = `[CAPABILITY_TYPE: ${state.capability?.type || "task"}]\n${state.taskInstructions || ""}\n${agentTaskWorkflowInstructions}`;

  await createTaskAndNotifyAgent(
    state.teamId,
    state.requestId,
    state.capability?.name,
    state.assignedAgentId,
    state.request.identifier,
    state.taskPrompt,
    finalInstructions
  );

  return {};
}

function routeAfterClassification(state: typeof IngestionState.State) {
  if (!state.classification.isKivoRelated && !state.classification.isTeamRelated) {
    return "genericAnswer";
  }
  if (state.classification.isOtherTeamRelated) {
    return "otherTeamRouting";
  }
  return "getTeamCapability";
}

const workflow = new StateGraph(IngestionState)
  .addNode("fetchContexts", fetchContextsNode)
  .addNode("classifyRequest", classifyRequestNode)
  .addNode("genericAnswer", genericAnswerNode)
  .addNode("otherTeamRouting", otherTeamRoutingNode)
  .addNode("getTeamCapability", getTeamCapabilityNode)
  .addNode("prepareTask", prepareTaskNode)
  .addNode("assignAgent", assignAgentNode)
  .addNode("createTask", createTaskNode)
  
  .addEdge(START, "fetchContexts")
  .addEdge("fetchContexts", "classifyRequest")
  .addConditionalEdges("classifyRequest", routeAfterClassification)
  .addEdge("genericAnswer", END)
  .addEdge("otherTeamRouting", END)
  .addEdge("getTeamCapability", "assignAgent")
  .addEdge("assignAgent", "prepareTask")
  .addEdge("prepareTask", "createTask")
  .addEdge("createTask", END);

export const requestIngestionWorkflow = workflow.compile();

export async function runRequestIngestion(requestId: string, teamId: string) {
  return await requestIngestionWorkflow.invoke({ requestId, teamId });
}
