import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db/client";
import { tasks, requests, agents, teams, workspaces } from "../db/schema";
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


  const [agent] = await db.select().from(agents).where(eq(agents.id, assignedAgentId));
  if (agent) {
    const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId));
    const workspaceId = team?.workspaceId;
    
    if (workspaceId) {
      console.log(`[tasksController] Triggering Native LangGraph Executor for task ${task.id}`);
      // We run it asynchronously so it doesn't block the request lifecycle
      import("../workflows/langgraph/executor").then(({ runLangchainExecutor }) => {
        runLangchainExecutor(task.id).catch(console.error);
      });
    }
  }
}
