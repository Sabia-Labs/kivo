import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db/client";
import { tasks, requests, conversations, messages, agents, teams, workspaces } from "../db/schema";
import { publishToAgent, getAdminCredentialsForWorkspace } from "../lib/rabbitmq";
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
    const [workspace] = team ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId)) : [];
    
    if (workspace) {
      const rabbitCreds = getAdminCredentialsForWorkspace(workspace.id);
      
      try {
        await publishToAgent(rabbitCreds, {
          tenantId: workspace.id,
          agentId: agent.id,
          sessionKey: conversation.id,
          messageId: randomBytes(16).toString("hex"),
          action: "chat_message",
          payload: { role: "user", content: messageContent },
        });
      } catch (err) {
        console.error("[request-ingestion] RabbitMQ publish failed:", err);
      }
    }
  }
}
