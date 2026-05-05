import { Router } from "express";
import { db } from "../db/client";
import { notifications } from "../db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { authMiddleware } from "../middleware/authMiddleware";

export const notificationsRouter = Router();

// GET /notifications
notificationsRouter.get("/", authMiddleware, async (req, res) => {
  try {
    const actorId = req.actor!.id;
    const actorType = req.actor!.type as "human" | "agent";
    
    let teamIdFilter = req.query.teamId as string | undefined;
    let priorityFilter = req.query.priority as string | undefined;

    const conditions: any[] = [
      eq(notifications.recipientId, actorId),
      eq(notifications.recipientType, actorType)
    ];

    if (teamIdFilter) {
      conditions.push(eq(notifications.teamId, teamIdFilter));
    }
    
    if (priorityFilter) {
      // e.g. ?priority=high,alert
      const priorities = priorityFilter.split(",");
      if (priorities.length > 0) {
         conditions.push(inArray(notifications.priority, priorities as any[]));
      }
    }

    const rows = await db.query.notifications.findMany({
      where: and(...conditions),
      orderBy: (notifications, { desc }) => [desc(notifications.createdAt)],
      limit: 50,
    });

    res.json({ data: rows });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to fetch notifications" });
  }
});

// PATCH /notifications/read-all
notificationsRouter.patch("/read-all", authMiddleware, async (req, res) => {
  try {
    const actorId = req.actor!.id;
    const actorType = req.actor!.type as "human" | "agent";

    await db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.recipientId, actorId),
        eq(notifications.recipientType, actorType),
        eq(notifications.isRead, false)
      ));

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update notifications" });
  }
});

// PATCH /notifications/:id/read
notificationsRouter.patch("/:id/read", authMiddleware, async (req, res) => {
  try {
    const notificationId = String(req.params.id);
    const actorId = req.actor!.id;
    const actorType = req.actor!.type as "human" | "agent";

    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientId, actorId),
        eq(notifications.recipientType, actorType)
      ))
      .returning();

    if (!updated) {
       return res.status(404).json({ error: "Notification not found or unauthorized" });
    }

    res.json({ data: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update notification" });
  }
});
