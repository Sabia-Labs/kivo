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
    title: `Execute capability: ${capabilityName || "Task"} for request ${requestIdentifier}`,
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

  let messageContent = `A new task has been created for you.
  Task ID: ${task.id}
  Task Title: ${task.title}
  Related Request: ${requestIdentifier}`;

  messageContent += `\n\n  Please read the task using the Kivo MCP, paying special attention to its prompt and instructions, and execute what's requested.`;

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
