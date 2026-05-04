import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, or, and, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { tasks, comments, workspaces, teams, activities, requests } from "../db/schema";
import { success, failure } from "../lib/response";
import { authMiddleware } from "../middleware/authMiddleware";
import { createTaskSchema, updateTaskSchema, createCommentSchema, updateCommentSchema } from "../schemas/task-management.schema";
import { z } from "zod";
import { updateRequest } from "../controllers/requestsController";

export const tasksRouter = Router();

// Helper to determine if a string is a UUID
const isUuid = (str: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);

// ── GET /tasks/by-team/:teamId ───────────────────────────────────────────────

tasksRouter.get("/by-team/:teamId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.teamId, String(req.params.teamId)))
      .orderBy(desc(tasks.createdAt));
      
    await Promise.all(rows.map(async (row) => {
      if (row.requestId) {
        const [reqRec] = await db.select({ state: requests.state }).from(requests).where(eq(requests.id, row.requestId));
        if (reqRec && reqRec.state) {
          (row as any).context = reqRec.state;
        }
      }
    }));
    
    // We might want to include labels and types, let's keep it simple for now or fetch them.
    res.json(success(rows));
  } catch (err) {
    next(err);
  }
});

export async function createTaskInternal(input: any, actor: { id: string, type: "human" | "agent" }) {
  return await db.transaction(async (tx) => {
    let finalRequestId = input.requestId;
    if (finalRequestId && !isUuid(finalRequestId)) {
      const [reqRec] = await tx.select({ id: requests.id }).from(requests).where(and(eq(requests.teamId, input.teamId), eq(requests.identifier, finalRequestId)));
      if (reqRec) {
        finalRequestId = reqRec.id;
      } else {
        throw new Error("Request not found for the given identifier");
      }
    }

    const [task] = await tx
      .insert(tasks)
      .values({
        teamId: input.teamId,
        requestId: finalRequestId,
        title: input.title,
        prompt: input.prompt,
        instructions: input.instructions,
        plan: input.plan,
        taskList: input.taskList,
        workSummary: input.workSummary,
        result: input.result,
        assignedToId: input.assignedToId,
        status: input.status,
        resolution: input.resolution,
      })
      .returning();


    // Log activity
    await tx.insert(activities).values({
      teamId: input.teamId,
      actorId: actor.id,
      actorType: actor.type,
      changeType: "creation",
      taskId: task.id,
      activityTitle: `Task created: ${task.title}`,
    });

    return task;
  });
}

// ── POST /tasks ───────────────────────────────────────────────────────────────

tasksRouter.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createTaskSchema.parse(req.body);
    const result = await createTaskInternal(input, req.actor!);

    res.status(201).json(success(result));
  } catch (err) {
    next(err);
  }
});

// ── GET /tasks/:id ────────────────────────────────────────────────────────────

tasksRouter.get("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idParam = String(req.params.id);
    if (!isUuid(idParam)) {
      res.status(400).json(failure("Invalid task ID"));
      return;
    }

    const [task] = await db.select().from(tasks).where(eq(tasks.id, idParam));

    if (!task) {
      res.status(404).json(failure("Task not found"));
      return;
    }
    
    if (task.requestId) {
      const [reqRec] = await db.select({ state: requests.state }).from(requests).where(eq(requests.id, task.requestId));
      if (reqRec && reqRec.state) {
        (task as any).context = reqRec.state;
      }
    }

    res.json(success(task));
  } catch (err) {
    next(err);
  }
});

// ── PUT /tasks/:id ────────────────────────────────────────────────────────────

tasksRouter.put("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idParam = String(req.params.id);
    if (!isUuid(idParam)) {
      res.status(400).json(failure("Invalid task ID"));
      return;
    }

    const input = updateTaskSchema.parse(req.body);

    const result = await db.transaction(async (tx) => {
      // Find the task ID first
      const [existingTask] = await tx.select({ id: tasks.id, teamId: tasks.teamId, title: tasks.title }).from(tasks).where(eq(tasks.id, idParam));
      if (!existingTask) throw new Error("Task not found");

      let finalRequestId = input.requestId;
      if (finalRequestId !== undefined && finalRequestId !== null && !isUuid(finalRequestId)) {
        const [reqRec] = await tx.select({ id: requests.id }).from(requests).where(and(eq(requests.teamId, existingTask.teamId), eq(requests.identifier, finalRequestId)));
        if (reqRec) {
          finalRequestId = reqRec.id;
        } else {
          throw new Error("Request not found for the given identifier");
        }
      }

      const [updated] = await tx
        .update(tasks)
        .set({
          ...input,
          requestId: finalRequestId !== undefined ? finalRequestId : input.requestId,
          updatedAt: new Date()
        })
        .where(eq(tasks.id, existingTask.id))
        .returning();


      // Log activity
      await tx.insert(activities).values({
        teamId: existingTask.teamId,
        actorId: req.actor!.id,
        actorType: req.actor!.type,
        changeType: "status",
        taskId: existingTask.id,
        activityTitle: `Task updated: ${updated.title || existingTask.title}`,
      });

      return updated;
    });

    if (result.status === "completed" && result.requestId) {
      const resolution = result.resolution === "failed" ? "failed" : "success";
      await updateRequest(
        result.requestId,
        {
          status: "completed",
          resolution,
          response: result.result || "Task completed."
        },
        req.actor!.id,
        req.actor!.type
      );
    }

    res.json(success(result));
  } catch (err: any) {
    if (err.message === "Task not found") {
      res.status(404).json(failure("Task not found"));
    } else {
      next(err);
    }
  }
});

// ── DELETE /tasks/:id ─────────────────────────────────────────────────────────

tasksRouter.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idParam = String(req.params.id);
    if (!isUuid(idParam)) {
      res.status(400).json(failure("Invalid task ID"));
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [deleted] = await tx.delete(tasks).where(eq(tasks.id, idParam)).returning();
      
      if (!deleted) {
        return null;
      }

      // Log activity
      await tx.insert(activities).values({
        teamId: deleted.teamId,
        actorId: req.actor!.id,
        actorType: req.actor!.type,
        changeType: "deletion",
        taskId: deleted.id,
        activityTitle: `Task deleted: ${deleted.title}`,
      });

      return deleted;
    });

    if (!result) {
      res.status(404).json(failure("Task not found"));
      return;
    }

    res.status(200).json(success({ deleted: true, id: result.id }));
  } catch (err) {
    next(err);
  }
});

// ── GET /tasks/:id/comments ───────────────────────────────────────────────────

tasksRouter.get("/:id/comments", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idParam = String(req.params.id);
    if (!isUuid(idParam)) {
      res.status(400).json(failure("Invalid task ID"));
      return;
    }

    const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, idParam));
    if (!task) {
       res.status(404).json(failure("Task not found"));
       return;
    }

    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.taskId, task.id))
      .orderBy(desc(comments.createdAt));
    
    res.json(success(rows));
  } catch (err) {
    next(err);
  }
});

// ── POST /tasks/:id/comments ──────────────────────────────────────────────────

tasksRouter.post("/:id/comments", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idParam = String(req.params.id);
    if (!isUuid(idParam)) {
      res.status(400).json(failure("Invalid task ID"));
      return;
    }

    const [task] = await db.select({ id: tasks.id, teamId: tasks.teamId }).from(tasks).where(eq(tasks.id, idParam));
    if (!task) {
       res.status(404).json(failure("Task not found"));
       return;
    }

    const input = createCommentSchema.parse({ ...req.body, taskId: task.id });

    const [comment] = await db
      .insert(comments)
      .values({
        teamId: task.teamId,
        taskId: task.id,
        actorId: req.actor!.id,
        actorType: req.actor!.type,
        content: input.content,
      })
      .returning();

    res.status(201).json(success(comment));
  } catch (err) {
    next(err);
  }
});

// ── DELETE /tasks/comments/:commentId ─────────────────────────────────────────

tasksRouter.delete("/comments/:commentId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [deleted] = await db
      .delete(comments)
      .where(eq(comments.id, String(req.params.commentId)))
      .returning();

    if (!deleted) {
      res.status(404).json(failure("Comment not found"));
      return;
    }

    res.status(200).json(success({ deleted: true, id: deleted.id }));
  } catch (err) {
    next(err);
  }
});
