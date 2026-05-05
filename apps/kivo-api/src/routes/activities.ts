import { Router } from "express";
import { db } from "../db/client";
import { activities as dbActivities, requests, tasks } from "../db/schema";
import { eq, desc, and, or, inArray } from "drizzle-orm";
import { authMiddleware } from "../middleware/authMiddleware";

export const activitiesRouter = Router({ mergeParams: true });

const isUuid = (str: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);

// GET /teams/:teamId/activities
activitiesRouter.get("/", authMiddleware, async (req, res) => {
  try {
    const teamId = String(req.params.teamId);
    let requestId = req.query.requestId as string | undefined;
    
    if (requestId && !isUuid(requestId)) {
      const [request] = await db.select({ id: requests.id }).from(requests).where(and(eq(requests.identifier, requestId), eq(requests.teamId, teamId)));
      if (request) {
        requestId = request.id;
      } else {
        return res.json({ data: [] });
      }
    }
    
    const conditions: any[] = [eq(dbActivities.teamId, teamId)];
    if (requestId) {
      // Find all tasks associated with this request
      const requestTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.requestId, requestId));
      const taskIds = requestTasks.map(t => t.id);

      const reqOrTaskConditions = [eq(dbActivities.requestId, requestId)];
      if (taskIds.length > 0) {
        reqOrTaskConditions.push(inArray(dbActivities.taskId, taskIds));
      }
      conditions.push(or(...reqOrTaskConditions));
    }

    // Fetch recent activities for the team, ordered by newest first
    const activitiesList = await db.query.activities.findMany({
      where: and(...conditions),
      orderBy: [desc(dbActivities.createdAt)],
      limit: 50,
    });

    res.json({ data: activitiesList });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});
