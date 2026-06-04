import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db/client";
import { tasks, requests, conversations, messages, agents, teams, workspaces } from "../db/schema";
import { workspaceNamespace, deliverMessageToAgent } from "../k8s/provisioner";
import { logActivity } from "../lib/activity-logger";
import { updateRequest } from "./requestsController";

export async function createTaskAndNotifyAgent(
  teamId: string,
  requestId: string,
  capabilityName: string | undefined,
  assignedAgentId: string,
  requestIdentifier: string,
  prompt?: string,
  instructions?: string
) {
  const [task] = await db.insert(tasks).values({
    teamId,
    requestId,
    title: capabilityName || "Task",
    prompt,
    instructions,
    assignedToId: assignedAgentId,
  }).returning();

  await logActivity({
    teamId,
    requestId,
    taskId: task.id,
    actorId: teamId, // system/agent context
    actorType: "agent",
    changeType: "creation",
    newState: task,
    activityTitle: `Task created: ${task.title}`
  });

  // Send message to agent
  const [conversation] = await db.insert(conversations).values({
    agentId: assignedAgentId,
    counterpartType: "external",
    counterpartId: "system",
    counterpartName: "System Orchestrator"
  }).returning();

  let messageContent = `A NEW task has been created for you:
  Task ID: ${task.id}
  Task Title: ${task.title}
  Kivo Request ID (Internal): ${requestIdentifier}`;

  messageContent += `\n\n  Please read the task using the Kivo MCP, paying special attention to its prompt and instructions, and execute what's requested. **ATTENTION** to the Task ID: ${task.id}. Forget eventual previous tasks: To update this task you MUST now use this current ID ${task.id}.`;

  const [userMessage] = await db.insert(messages).values({
    conversationId: conversation.id,
    role: "user",
    content: messageContent
  }).returning();

  const [agent] = await db.select().from(agents).where(eq(agents.id, assignedAgentId));
  if (agent) {
    const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId));
    const workspaceId = team?.workspaceId;
    
    if (workspaceId) {
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
      
      // Feature Flag Branch: Use LangChain executor natively
      if (process.env.FEATURE_FLAG_LANGCHAIN === "true" && workspace?.langchain) {
        console.log(`[tasksController] Triggering Native LangGraph Executor for task ${task.id}`);
        // We run it asynchronously so it doesn't block the request lifecycle
        import("../workflows/langgraph/executor").then(({ runLangchainExecutor }) => {
          runLangchainExecutor(task.id).catch(console.error);
        });
        return;
      }

      // Legacy OpenClaw Kubernetes branch
      const namespace = workspaceNamespace(workspaceId);
      
      try {
        const delivered = await deliverMessageToAgent(namespace, agent.id, {
          sessionKey: conversation.id,
          content: messageContent,
          messageId: userMessage.id,
        });

        if (delivered) {
          await db.update(messages).set({ deliveredAt: new Date() }).where(eq(messages.id, userMessage.id));
        }
      } catch (err) {
        console.error("[request-ingestion] HTTP push failed:", err);
      }
    }
  }
}
