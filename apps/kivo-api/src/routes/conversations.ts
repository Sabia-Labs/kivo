import { randomBytes } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { conversations, messages, agents, workspaces, teams } from "../db/schema";
import { createConversationSchema, createMessageSchema } from "../schemas/conversation.schema";
import { success, failure } from "../lib/response";
import { workspaceNamespace, deliverMessageToAgent } from "../k8s/provisioner";
import { authMiddleware } from "../middleware/authMiddleware";

export const conversationsRouter = Router();

// ── POST /conversations ───────────────────────────────────────────────────────
conversationsRouter.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createConversationSchema.parse(req.body);

    const [conversation] = await db
      .insert(conversations)
      .values(input)
      .returning();

    res.status(201).json(success(conversation));
  } catch (err) {
    next(err);
  }
});

// ── GET /conversations?agentId= ───────────────────────────────────────────────
conversationsRouter.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.query;

    if (!agentId) {
      res.status(400).json(failure("agentId query param is required"));
      return;
    }

    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.agentId, String(agentId)))
      .orderBy(desc(conversations.updatedAt));

    res.json(success(rows));
  } catch (err) {
    next(err);
  }
});

// ── GET /conversations/:id ────────────────────────────────────────────────────
conversationsRouter.get("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, String(req.params.id)));

    if (!conversation) {
      res.status(404).json(failure("Conversation not found"));
      return;
    }

    res.json(success(conversation));
  } catch (err) {
    next(err);
  }
});

// ── GET /conversations/:id/messages ──────────────────────────────────────────
conversationsRouter.get("/:id/messages", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, String(req.params.id)))
      .orderBy(messages.createdAt);

    res.json(success(rows));
  } catch (err) {
    next(err);
  }
});

// ── POST /conversations/:id/messages ─────────────────────────────────────────
conversationsRouter.post("/:id/messages", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversationId = String(req.params.id);

    // Verify conversation exists
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    if (!conversation) {
      res.status(404).json(failure("Conversation not found"));
      return;
    }

    const input = createMessageSchema.parse(req.body);

    // ── 1. Store user message ─────────────────────────────────────────────────
    const [userMessage] = await db
      .insert(messages)
      .values({ ...input, conversationId })
      .returning();

    // Bump conversation.updatedAt
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    // ── 2. Resolve Agent and Namespace ────────────────────────────────────────
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, conversation.agentId));

    if (!agent) {
      res.status(201).json(success({ userMessage, agentMessage: null }));
      return;
    }

    const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId));
    const workspaceId = team?.workspaceId;

    if (!workspaceId) {
      res.status(201).json(success({ userMessage, agentMessage: null }));
      return;
    }

    const namespace = workspaceNamespace(workspaceId);

    // ── 3. Push to Agent Sidecar ──────────────────────────────────────────────
    const sessionKey = conversationId;
    const messageId = userMessage.id;

    const delivered = await deliverMessageToAgent(namespace, agent.id, {
      sessionKey,
      content: input.content,
      messageId,
    });

    if (delivered) {
      await db
        .update(messages)
        .set({ deliveredAt: new Date() })
        .where(eq(messages.id, messageId));
    } else {
      // If delivery failed, return an error so the UI can show the error state
      res.status(500).json(failure("Failed to deliver message to agent sidecar."));
      return;
    }

    // Return the user message immediately. The UI already polls for replies.
    res.status(201).json(success({ userMessage, agentMessage: null, delivered }));
  } catch (err) {
    next(err);
  }
});
