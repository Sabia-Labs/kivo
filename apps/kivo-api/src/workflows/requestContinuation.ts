import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { db } from "../db/client";
import { requests, tasks, notifications } from "../db/schema";
import { eq, asc } from "drizzle-orm";
import { updateRequest, completeRequest, addCommentToRequest } from "../controllers/requestsController";
import { getCapabilityByIdentifier } from "../controllers/capabilitiesController";
import { createTaskAndNotifyAgent } from "../controllers/tasksController";
import { getTeamById } from "../controllers/teamsController";
import { getAgentsByTeam } from "../controllers/agentsController";
import * as dotenv from "dotenv";
import * as path from "path";

let llmInstance: ChatOpenAI | null = null;
function getLlm() {
  if (!llmInstance) {
    dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("[request-continuation] CRITICAL: OPENAI_API_KEY is missing from environment.");
    }
    llmInstance = new ChatOpenAI({ 
      modelName: "gpt-4o", 
      temperature: 0,
      apiKey: apiKey 
    });
  }
  return llmInstance;
}

const ContinuationState = Annotation.Root({
  taskId: Annotation<string>,
  requestId: Annotation<string>,
  teamId: Annotation<string>,
  
  task: Annotation<any>,
  request: Annotation<any>,
  teamContext: Annotation<string>,

  capability: Annotation<any>,
  assignedAgentId: Annotation<string>,
  taskPrompt: Annotation<string>,
  taskInstructions: Annotation<string>,
});

async function analyzeCompletionNode(state: typeof ContinuationState.State) {
  console.log(`[request-continuation] Node: analyzeCompletion. Task ID: ${state.taskId}, Request ID: ${state.requestId}`);
  
  const [taskRecord] = await db.select().from(tasks).where(eq(tasks.id, state.taskId));
  if (!taskRecord) throw new Error("Task not found");

  const [requestRecord] = await db.select().from(requests).where(eq(requests.id, state.requestId));
  if (!requestRecord) throw new Error("Request not found");

  // If task failed
  if (taskRecord.status === "failed") {
    // Count all tasks for this request so far
    const allTasks = await db.select().from(tasks)
      .where(eq(tasks.requestId, state.requestId));

    const capabilitiesWorkflow = (requestRecord.capabilitiesWorkflow as string[]) || [];

    // Case 1: If it's the last capability (or only one), mark the request as completed and failed.
    if (allTasks.length >= capabilitiesWorkflow.length) {
      console.log(`[request-continuation] Task failed on the last capability. Completing request as failed.`);
      await completeRequest(state.requestId, "failed", taskRecord.failureReason || "Task failed.");

      // Create Alert Notification
      if (requestRecord.requesterUserId) {
        await db.insert(notifications).values({
          teamId: state.teamId,
          recipientId: requestRecord.requesterUserId,
          recipientType: "human",
          title: "Request Workflow Failed",
          content: `Request ${requestRecord.identifier} has failed on step "${taskRecord.title}": ${taskRecord.failureReason || "Task failed."}`,
          priority: "alert",
          relatedEntityId: state.requestId,
          relatedEntityType: "request"
        });
      }

      return { task: taskRecord, request: requestRecord };
    } else {
      // Case 2: Multi-step workflow with more tasks remaining.
      // - Put request status as waiting_user
      // - Add a comment showing the failure reason returned by the task
      console.log(`[request-continuation] Task failed on a multi-step request. Putting request in waiting_user status.`);
      
      const failureReason = taskRecord.failureReason || "no reason";
      
      // Update request to waiting_user
      await updateRequest(state.requestId, { status: "waiting_user" }, state.teamId, "agent");
      
      // Add comment showing the failure reason from the assigned agent's perspective
      const commentContent = `I tried to execute the step **${taskRecord.title}** but unfortunately it failed.
**Reason:** ${failureReason}

How should we proceed?`;
      await addCommentToRequest(
        state.requestId, 
        state.teamId, 
        taskRecord.assignedToId || state.teamId, 
        "agent", 
        commentContent
      );

      // Create Alert Notification
      if (requestRecord.requesterUserId) {
        await db.insert(notifications).values({
          teamId: state.teamId,
          recipientId: requestRecord.requesterUserId,
          recipientType: "human",
          title: "Step Failed in Request Workflow",
          content: `Step "${taskRecord.title}" in Request ${requestRecord.identifier} failed: ${failureReason}`,
          priority: "alert",
          relatedEntityId: state.requestId,
          relatedEntityType: "request"
        });
      }
      
      // Re-fetch updated request
      const [updatedRequest] = await db.select().from(requests).where(eq(requests.id, state.requestId));
      return { task: taskRecord, request: updatedRequest };
    }
  }

  // Update request state with the successful task's result
  const taskResultEntry = `Task '${taskRecord.title}' completed successfully. Result: ${taskRecord.result || "No result provided."}`;
  const currentRequestState = requestRecord.state || [];
  const updatedState = [...currentRequestState, taskResultEntry];
  
  await updateRequest(state.requestId, { state: updatedState }, state.teamId, "agent");

  // Re-fetch updated request
  const [updatedRequest] = await db.select().from(requests).where(eq(requests.id, state.requestId));

  // Count all tasks for this request
  const allTasks = await db.select().from(tasks)
    .where(eq(tasks.requestId, state.requestId))
    .orderBy(asc(tasks.createdAt)); // ordered to ensure consistent counting
    
  const capabilitiesWorkflow = (requestRecord.capabilitiesWorkflow as string[]) || [];
  
  if (allTasks.length >= capabilitiesWorkflow.length) {
    console.log(`[request-continuation] All ${capabilitiesWorkflow.length} capabilities executed. Completing request.`);
    await completeRequest(state.requestId, "success", taskRecord.result || "All tasks completed.");
    return { task: taskRecord, request: updatedRequest };
  }

  // Find next capability
  const nextCapabilityIdentifier = capabilitiesWorkflow[allTasks.length];
  console.log(`[request-continuation] Executing next capability (${allTasks.length + 1} of ${capabilitiesWorkflow.length}): ${nextCapabilityIdentifier}`);
  
  const capability = await getCapabilityByIdentifier(state.teamId, nextCapabilityIdentifier);
  if (!capability) {
    console.warn(`[request-continuation] Capability ${nextCapabilityIdentifier} not found. Failing request.`);
    await completeRequest(state.requestId, "failed", `Capability ${nextCapabilityIdentifier} not found.`);
    return { task: taskRecord, request: updatedRequest };
  }

  // Build team context for assignment
  const team = await getTeamById(state.teamId);
  const teamAgents = await getAgentsByTeam(state.teamId);
  const teamContext = `Team Name: ${team?.name}\nAgents:\n${teamAgents.map(a => `- ${a.name} (Role: ${a.roleId}, ID: ${a.id})`).join("\n")}`;

  return { task: taskRecord, request: updatedRequest, capability, teamContext };
}

function routeAfterAnalysis(state: typeof ContinuationState.State) {
  if (state.task.status === "failed") {
    return END;
  }
  
  const allTasksCount = state.request.state ? state.request.state.length : 1; // rough proxy, logic already handled in node
  const capabilitiesLength = state.request.capabilitiesWorkflow ? state.request.capabilitiesWorkflow.length : 0;
  
  // Re-verify if we actually loaded a capability to continue
  if (state.capability) {
    return "prepareTask";
  }

  return END;
}

const prepareTaskSchema = z.object({
  prompt: z.string().describe("The task prompt must reflect the work to be done, what the end user expects to be achieved. The agents will rely on this prompt to understand the task."),
  instructions: z.string().describe("Instructions for the agent to perform the task.")
});

async function prepareTaskNode(state: typeof ContinuationState.State) {
  console.log(`[request-continuation] Node: prepareTask. Request ID: ${state.requestId}`);
  
  const requestStateContext = state.request.state && state.request.state.length > 0 
    ? state.request.state.join("\n\n") 
    : "None";

  const prompt = `You are a helpful agent preparing a task for another agent in a sequential workflow.
  
  What the user wants (Original Request): ${state.request.title}
  Original Request Details: ${state.request.requestDetails || "None"}
  
  The results of previous steps in this workflow are below. You MUST USE this information to prepare the input for the next step:
  === PREVIOUS WORK STATE ===
  ${requestStateContext}
  ===========================
  
  You must understand the capability template for the NEXT step to give instructions to the assigned agent:
  - Template Name: ${state.capability?.name}
  - Template Instructions: ${state.capability?.instructions}
  - Required Inputs: ${state.capability?.inputsDescription || "None"}
  - Expected Outputs: ${state.capability?.expectedOutputsDescription || "None"}
  
  Now, create a prompt and instructions for the assigned agent to perform this next task. 
  Make the prompt specific and ensure you pass any necessary data from the "PREVIOUS WORK STATE" that satisfies the "Required Inputs" of the template.
  The instructions should be detailed. It should be clear for the agent what it needs to do.
  `;

  const structuredLlm = getLlm().withStructuredOutput(prepareTaskSchema);
  const result = await structuredLlm.invoke(prompt);

  return { taskPrompt: result.prompt, taskInstructions: result.instructions };
}

const agentAssignmentSchema = z.object({
  assignedAgentId: z.string().uuid().describe("The UUID of the agent best suited to perform the task.")
});

async function assignAgentNode(state: typeof ContinuationState.State) {
  console.log(`[request-continuation] Node: assignAgent. Request ID: ${state.requestId}`);
  if (state.capability?.assignedAgentId) {
    return { assignedAgentId: state.capability.assignedAgentId };
  }

  const prompt = `Select the best agent to execute this capability based on the team context.
  Capability: ${state.capability?.name} - ${state.capability?.instructions}
  Team Agents:
  ${state.teamContext}
  `;

  const structuredLlm = getLlm().withStructuredOutput(agentAssignmentSchema);
  const result = await structuredLlm.invoke(prompt);

  return { assignedAgentId: result.assignedAgentId };
}

async function createTaskNode(state: typeof ContinuationState.State) {
  console.log(`[request-continuation] Node: createTask. Request ID: ${state.requestId}`);

  const agentTaskWorkflowInstructions = `
---
CRITICAL TASK WORKFLOW INSTRUCTIONS:
You are executing a Task. You must process it following this standard workflow:
1. INPUT: Use the 'title', 'prompt', and 'context' fields to understand the request. Respect all specific 'instructions'.
2. EXECUTION: If the activity is complex, formulate a plan and list steps in the 'plan' and 'taskList' fields. If simple, provide a brief rationale in the 'plan' field. Summarize your actions and thoughts in the 'workSummary' field. If you successfully accomplished the requested task, populate the 'result' field with the final deliverable/outcome. If the task failed or you could not complete it, got blocked or whatever reason you did not proceed, then you MUST populate the 'failureReason' field with a detailed description of the error, blocker, or why you could not execute it. In whatever situation you MUST ALWAYS finish by updating the task 'status' field with 'success' or 'failed'. If the task was completed satisfactorily, you MUST set 'status' to 'success'. If you are in doubt, encounter a blocker, or are unable to execute the requested actions, you MUST set 'status' to 'failed' to signal the failure. Do not leave the task open; it must be resolved.`;

  const finalInstructions = `${state.taskInstructions || ""}\n${agentTaskWorkflowInstructions}`;

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

const workflow = new StateGraph(ContinuationState)
  .addNode("analyzeCompletion", analyzeCompletionNode)
  .addNode("prepareTask", prepareTaskNode)
  .addNode("assignAgent", assignAgentNode)
  .addNode("createTask", createTaskNode)
  
  .addEdge(START, "analyzeCompletion")
  .addConditionalEdges("analyzeCompletion", routeAfterAnalysis)
  .addEdge("prepareTask", "assignAgent")
  .addEdge("assignAgent", "createTask")
  .addEdge("createTask", END);

export const requestContinuationWorkflow = workflow.compile();

export async function runRequestContinuation(taskId: string, requestId: string, teamId: string) {
  return await requestContinuationWorkflow.invoke({ taskId, requestId, teamId });
}
