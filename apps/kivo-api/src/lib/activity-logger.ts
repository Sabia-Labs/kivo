import { db } from "../db/client";
import { activities, type NewActivity } from "../db/schema";

export async function logActivity(params: {
  teamId: string;
  requestId?: string;
  taskId?: string;
  actorId: string;
  actorType: "human" | "agent";
  changeType: "data" | "status" | "relationship" | "creation" | "deletion";

  oldState?: any;
  newState?: any;
  activityTitle: string;
}) {
  try {
    await db.insert(activities).values({
      teamId: params.teamId,
      requestId: params.requestId,
      taskId: params.taskId,
      actorId: params.actorId,
      actorType: params.actorType,
      changeType: params.changeType,

      oldState: params.oldState || null,
      newState: params.newState || null,
      activityTitle: params.activityTitle,
    });
  } catch (error) {
    console.error(`Failed to log activity [${params.changeType}] for request/task:`, error);
  }
}
