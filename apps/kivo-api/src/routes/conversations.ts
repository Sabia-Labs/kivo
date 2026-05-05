import { randomBytes } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { conversations, messages, agents, workspaces, teams } from "../db/schema";
import { createConversationSchema, createMessageSchema } from "../schemas/conversation.schema";
import { success, failure } from "../lib/response";
import {
  publishToAgent,
  waitForReply,
  getAdminCredentialsForWorkspace,
} from "../lib/rabbitmq";

export const conversationsRouter = Router();

// ── POST /conversations ───────────────────────────────────────────────────────

conversationsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
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

conversationsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
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

conversationsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
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

conversationsRouter.get("/:id/messages", async (req: Request, res: Response, next: NextFunction) => {
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
//
// Full messaging flow:
//  1. Validate and store the user message in the DB (role=user).
//  2. Resolve the agent's workspace AMQP credentials.
//  3. Publish the message to the tenant exchange (routing key: agent.<agentId>).
//     The consumer sidecar in the agent's pod receives it and calls the openclaw
//     gateway at http://127.0.0.1:18789/v1/chat/completions with the session key.
//     Openclaw responds synchronously via HTTP; the sidecar publishes the reply
//     back to the exchange (routing key: reply.<sessionKey>).
//  4. The API long-polls for the reply (up to 30s).
//  5. On reply received: store as assistant message, bump updatedAt, return both messages.
//  6. On timeout: return 504 Gateway Timeout (UI can retry or show error).

conversationsRouter.post("/:id/messages", async (req: Request, res: Response, next: NextFunction) => {
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

    // ── 2. Resolve workspace AMQP credentials ─────────────────────────────────
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, conversation.agentId));

    if (!agent) {
      // Agent deleted — return user message only (no RabbitMQ dispatch)
      res.status(201).json(success({ userMessage, agentMessage: null }));
      return;
    }

    const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId));
    const [workspace] = team
      ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId))
      : [];

    if (!workspace) {
      res.status(201).json(success({ userMessage, agentMessage: null }));
      return;
    }

    // ── 3. Publish to RabbitMQ ────────────────────────────────────────────────
    // sessionKey = conversationId → maps 1:1 to openclaw's x-openclaw-session-key.
    // This ensures each conversation maintains its own session context in openclaw.
    const messageId = randomBytes(16).toString("hex");
    const sessionKey = conversationId; // ubiquitous language: sessionKey = conversationId

    const rabbitCreds = getAdminCredentialsForWorkspace(workspace.id);

    try {
      await publishToAgent(rabbitCreds, {
        tenantId:   workspace.id,
        agentId:    agent.id,
        sessionKey,
        messageId,
        action:     "chat_message",
        payload:    { role: "user", content: input.content },
      });
    } catch (publishErr) {
      console.error("[conversations] RabbitMQ publish failed:", publishErr);
      // Return the user message; agent reply will be unavailable
      res.status(201).json(success({ userMessage, agentMessage: null, error: "messaging_unavailable" }));
      return;
    }

    // ── 4. Long-poll for the agent's reply (30s) ──────────────────────────────
    // The consumer sidecar calls openclaw synchronously, then publishes the reply
    // back to reply.<sessionKey>. We subscribe here and wait.
    const LONG_POLL_MS = 30_000;
    const replyJson = await waitForReply(rabbitCreds, sessionKey, LONG_POLL_MS);

    if (!replyJson) {
      // Accepted, but not yet ready — signal to the UI to keep the user message.
      res.status(202).json({
        data: { userMessage, agentMessage: null },
        error: { message: "Agent is taking longer than expected to reply. Your message was received." },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    // ── 5. Parse reply and store as assistant message ─────────────────────────
    let replyContent: string;
    try {
      const parsed = JSON.parse(replyJson) as Record<string, unknown>;
      // Support both raw-string and OpenAI-compatible choices[] format
      replyContent =
        (parsed.content as string) ??
        ((parsed.choices as any)?.[0]?.message?.content as string) ??
        replyJson;
    } catch {
      replyContent = replyJson;
    }

    const [agentMessage] = await db
      .insert(messages)
      .values({ conversationId, role: "assistant", content: replyContent })
      .returning();

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    res.status(201).json(success({ userMessage, agentMessage }));
  } catch (err) {
    next(err);
  }
});
