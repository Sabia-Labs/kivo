import { z } from "zod";

// Compatible with editor payloads such as Tiptap/ProseMirror JSON documents.
// This supports markdown workflows plus image-paste metadata via JSON nodes.
const richTextSchema = z.record(z.string(), z.unknown()).or(z.array(z.unknown()));

export const createTaskSchema = z.object({
  teamId: z.string().uuid(),
  requestId: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  prompt: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  plan: z.string().nullable().optional(),
  taskList: z.string().nullable().optional(),
  workSummary: z.string().nullable().optional(),
  result: z.string().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  status: z.enum(["open", "in_progress", "waiting_user", "completed", "cancelled"]).optional(),
  resolution: z.enum(["success", "failed"]).nullable().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().omit({ teamId: true });

export const createCommentSchema = z.object({
  taskId: z.string().uuid(),
  content: z.string().min(1),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1),
});


