import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { conversations, messages, agents, workspaces, teams } from "../db/schema";
import { createConversationSchema, createMessageSchema } from "../schemas/conversation.schema";
import { success, failure } from "../lib/response";
import { authMiddleware } from "../middleware/authMiddleware";
import { runChatEngine } from "../workflows/langgraph/chatEngine";
import { resolveWorkspaceLanguage } from "../lib/i18n";

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

    // Return the user message immediately. The UI already polls for replies.
    res.status(201).json(success({ userMessage, agentMessage: null }));

    // ── 2. Run Chat Engine Asynchronously ──────────────────────────────────────
    if (req.actor && req.actor.type === "human") {
      db.select().from(agents).where(eq(agents.id, conversation.agentId)).then(([agent]) => {
        if (agent) {
          runChatEngine({
            conversationId,
            teamId: agent.teamId, // Provide the actual valid team ID from the agent
            agentId: conversation.agentId,
            userId: req.actor!.id, // Non-null asserted because of the check
            userMessage: input.content,
          }).catch(async (err) => {
            console.error(`[chat-engine] Failed to run for conversation ${conversationId}:`, err);
            
            try {
              // ── Write fallback message ──────────────────────────────────────────
              const lang = await resolveWorkspaceLanguage(agent.teamId);
              let errorMessage = "An internal error occurred and I could not process your request.";
              if (lang === "pt") errorMessage = "Ocorreu um erro interno e não consegui processar sua mensagem.";
              if (lang === "zh") errorMessage = "发生内部错误，我无法处理您的请求。";

              await db.insert(messages).values({
                conversationId,
                role: "assistant",
                content: errorMessage,
              });

              await db.update(conversations)
                .set({ updatedAt: new Date() })
                .where(eq(conversations.id, conversationId));
            } catch (fallbackErr) {
              console.error(`[chat-engine] Failed to save fallback message for conversation ${conversationId}:`, fallbackErr);
            }
          });
        }
      });
    }

  } catch (err) {
    next(err);
  }
});
