#!/usr/bin/env node
/**
 * kivo-consumer — RabbitMQ↔OpenClaw gateway bridge
 *
 * Implements the full OpenClaw qa-channel bus protocol:
 *
 *  A. INBOUND (RabbitMQ → OpenClaw):
 *     - Consumes agent messages from RabbitMQ
 *     - Enqueues them in the qa-channel bus as `inbound-message` events
 *     - OpenClaw polls POST /v1/poll to receive those events
 *
 *  B. OUTBOUND (OpenClaw → RabbitMQ):
 *     - OpenClaw calls POST /v1/outbound/message with its reply text
 *     - We route the reply back to RabbitMQ (reply.<sessionKey>)
 *
 *  C. SEND API (OpenClaw → other agents):
 *     - Exposes POST 127.0.0.1:18780/send so OpenClaw can dispatch
 *       messages to other agents via RabbitMQ.
 *
 * qa-channel bus endpoints (127.0.0.1:43123):
 *   GET  /v1/state              → bus health/state
 *   POST /v1/poll               → long-poll for inbound events
 *   POST /v1/outbound/message   → OpenClaw sends reply text here
 *   POST /v1/inbound/message    → inject an inbound message (used by tests / future)
 *   POST /v1/actions/*          → stubs (react, edit, delete, read, search, thread-create)
 *
 * Configuration (env vars from the `rabbitmq-credentials` Secret):
 *   RABBITMQ_HOST, RABBITMQ_AMQP_PORT, RABBITMQ_VHOST,
 *   RABBITMQ_USERNAME, RABBITMQ_PASSWORD, RABBITMQ_EXCHANGE,
 *   AGENT_ID, OPENCLAW_GATEWAY_URL, OPENCLAW_GATEWAY_TOKEN, SEND_API_PORT
 */

import * as amqp from "amqplib";
import * as http from "http";

// ── Config ────────────────────────────────────────────────────────────────────

const RABBITMQ_HOST     = process.env.RABBITMQ_HOST      ?? "localhost";
const RABBITMQ_PORT     = Number(process.env.RABBITMQ_AMQP_PORT ?? "5672");
const RABBITMQ_VHOST    = process.env.RABBITMQ_VHOST     ?? "/";
const RABBITMQ_USER     = process.env.RABBITMQ_USERNAME  ?? "guest";
const RABBITMQ_PASS     = process.env.RABBITMQ_PASSWORD  ?? "guest";
const RABBITMQ_EXCHANGE = process.env.RABBITMQ_EXCHANGE  ?? "kivo-exchange";
const AGENT_ID          = process.env.AGENT_ID           ?? "";
const SEND_API_PORT     = Number(process.env.SEND_API_PORT   ?? "18780");

if (!AGENT_ID) {
  console.error("[consumer] FATAL: AGENT_ID env var is required");
  process.exit(1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentCommand {
  tenantId:   string;
  agentId:    string;
  sessionKey: string;
  messageId:  string;
  action:     string;
  payload:    Record<string, unknown>;
}

// The event shape OpenClaw's qa-channel expects from /v1/poll
// From the source: inbound.conversation.id, inbound.conversation.kind, inbound.senderName, inbound.senderId, inbound.text, inbound.id
interface QaBusConversation {
  id:    string;              // conversationId / sessionKey
  kind:  "direct" | "channel"; // chatType
  title?: string;
}

interface QaBusInboundMessage {
  id:           string;          // message ID
  conversation: QaBusConversation;
  text:         string;
  senderId:     string;
  senderName:   string;
  timestamp:    number;
  replyToId?:   string;
  threadId?:    string;
  threadTitle?: string;
}

interface QaBusPollEvent {
  kind:    "inbound-message";
  message: QaBusInboundMessage;
}

interface QaBusPollResponse {
  cursor: number;
  events: QaBusPollEvent[];
}

// amqplib 0.10.x: connect() returns ChannelModel
type AmqpConnection = amqp.ChannelModel;
type AmqpChannel    = amqp.Channel;

// ── AMQP connection with auto-reconnect ───────────────────────────────────────

const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

function buildAmqpUrl(): string {
  const vhostEnc = encodeURIComponent(RABBITMQ_VHOST);
  return `amqp://${encodeURIComponent(RABBITMQ_USER)}:${encodeURIComponent(RABBITMQ_PASS)}@${RABBITMQ_HOST}:${RABBITMQ_PORT}/${vhostEnc}`;
}

async function connectWithRetry(attempt = 0): Promise<AmqpConnection> {
  try {
    const conn = await amqp.connect(buildAmqpUrl());
    console.log(`[consumer] Connected to RabbitMQ (vhost: ${RABBITMQ_VHOST})`);
    attempt = 0;

    conn.on("error", (err: Error) => {
      console.error("[consumer] Connection error:", err.message);
    });

    conn.on("close", () => {
      console.warn("[consumer] Connection closed — reconnecting...");
      setTimeout(() => startConsumer(), RETRY_DELAYS_MS[0]);
    });

    return conn;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    console.error(`[consumer] RabbitMQ connection failed (attempt ${attempt + 1}): ${message}. Retrying in ${delay}ms...`);
    await sleep(delay);
    return connectWithRetry(attempt + 1);
  }
}

// ── QA Channel Bus state ──────────────────────────────────────────────────────
//
// OpenClaw polls POST /v1/poll for events in this queue.
// Each event has kind:"inbound-message" with the message object.
// When OpenClaw is done processing, it calls POST /v1/outbound/message with its reply.

const QA_BUS_PORT = 43123;

// Each pending event in the poll queue
const eventQueue: QaBusPollEvent[] = [];
let   globalCursor = 0;

// Long-poll waiters: resolve when a new event arrives or timeout fires
type PollWaiter = {
  resolve: (response: QaBusPollResponse) => void;
  timer:   ReturnType<typeof setTimeout>;
};
const pollWaiters: PollWaiter[] = [];

// Session tracking: sessionKey → { cmd, rabbitMsg }
// Used to route OpenClaw's reply back to the correct RabbitMQ message
interface ActiveSession {
  cmd:        AgentCommand;
  rabbitMsg:  amqp.ConsumeMessage;
  conversationId: string; // the "dm:<sessionKey>" string sent to OpenClaw
}
const activeSessions = new Map<string, ActiveSession>();

// RabbitMQ channel (set after connect) for replying
let globalAmqChannel: AmqpChannel | null = null;

/** Push a new inbound event and wake up any waiting polls */
function pushEvent(event: QaBusPollEvent): void {
  eventQueue.push(event);
  globalCursor += 1;
  const cursor = globalCursor;

  // Wake all waiting polls
  const waiters = pollWaiters.splice(0);
  for (const w of waiters) {
    clearTimeout(w.timer);
    w.resolve({ cursor, events: [event] });
  }
}

// ── Simple HTTP helpers ───────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
  });
}

function writeJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

// ── QA Bus HTTP server ────────────────────────────────────────────────────────

async function startQaBusServer(): Promise<void> {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost`);
    const pathname = url.pathname;

    console.log(`[qa-bus] ${req.method} ${pathname}`);

    try {
      // ── GET /health ─────────────────────────────────────────────────────
      // Readiness probe: only returns 200 OK when RabbitMQ connection is established.
      if (req.method === "GET" && pathname === "/health") {
        if (globalAmqChannel) {
          writeJson(res, 200, { status: "ok" });
        } else {
          writeJson(res, 503, { status: "unavailable", reason: "RabbitMQ not connected" });
        }
        return;
      }

      // ── GET /v1/state ─────────────────────────────────────────────────────
      if (req.method === "GET" && pathname === "/v1/state") {
        writeJson(res, 200, {
          ok:      true,
          running: true,
          cursor:  globalCursor,
          queued:  eventQueue.length,
          agentId: AGENT_ID,
        });
        return;
      }

      // ── POST /v1/poll ─────────────────────────────────────────────────────
      if (req.method === "POST" && pathname === "/v1/poll") {
        const body = await readBody(req);
        let pollReq: { accountId?: string; cursor?: number; timeoutMs?: number } = {};
        try { pollReq = JSON.parse(body); } catch { /* ignore */ }

        const clientCursor  = pollReq.cursor   ?? 0;
        const timeoutMs     = Math.min(pollReq.timeoutMs ?? 5_000, 30_000);

        // Return anything that arrived after clientCursor immediately
        if (globalCursor > clientCursor && eventQueue.length > 0) {
          writeJson(res, 200, {
            cursor: globalCursor,
            events: eventQueue.splice(0),
          } satisfies QaBusPollResponse);
          return;
        }

        // Long-poll: wait until an event arrives or timeout
        await new Promise<void>((resolve) => {
          let responded = false;

          const timer = setTimeout(() => {
            if (responded) return;
            responded = true;
            const idx = pollWaiters.findIndex((w) => w.timer === timer);
            if (idx >= 0) pollWaiters.splice(idx, 1);
            writeJson(res, 200, { cursor: globalCursor, events: [] } satisfies QaBusPollResponse);
            resolve();
          }, timeoutMs);

          pollWaiters.push({
            timer,
            resolve: (response) => {
              if (responded) return;
              responded = true;
              writeJson(res, 200, response);
              resolve();
            },
          });
        });
        return;
      }

      // ── POST /v1/outbound/message ─────────────────────────────────────────
      // OpenClaw calls this to send its reply text back to us.
      // Payload: { to, text, senderId, senderName, accountId, threadId?, replyToId? }
      if (req.method === "POST" && pathname === "/v1/outbound/message") {
        const body   = await readBody(req);
        const payload = JSON.parse(body ?? "{}") as {
          to?:          string;
          text?:        string;
          senderId?:    string;
          senderName?:  string;
          accountId?:   string;
          threadId?:    string;
          replyToId?:   string;
        };

        console.log(`[qa-bus] OpenClaw outbound → to="${payload.to}" text="${payload.text?.slice(0, 80)}"`);

        // Find which active session this reply belongs to
        // `to` will be "dm:<sessionKey>"
        let session: ActiveSession | undefined;
        const toConvId = payload.to ?? "";

        for (const [key, sess] of activeSessions.entries()) {
          if (sess.conversationId === toConvId || activeSessions.size === 1) {
            session = sess;
            activeSessions.delete(key);
            break;
          }
        }

        const msgId = `out-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        if (session && globalAmqChannel) {
          const replyRoutingKey = `reply.${session.cmd.sessionKey}`;
          globalAmqChannel.publish(
            RABBITMQ_EXCHANGE,
            replyRoutingKey,
            Buffer.from(JSON.stringify({
              content:    payload.text ?? "",
              sessionKey: session.cmd.sessionKey,
              messageId:  session.cmd.messageId,
            })),
            {
              contentType:   "application/json",
              correlationId: session.cmd.messageId,
              deliveryMode:  1,
            },
          );
          console.log(`[qa-bus] Reply routed to RabbitMQ → reply.${session.cmd.sessionKey}`);
        } else {
          console.warn(`[qa-bus] No active session for to="${payload.to}" — reply discarded`);
        }

        // OpenClaw expects: { message: { id } }
        writeJson(res, 200, { message: { id: msgId } });
        return;
      }

      // ── POST /v1/inbound/message ──────────────────────────────────────────
      // Allows external injection of inbound messages (tests, future tooling)
      if (req.method === "POST" && pathname === "/v1/inbound/message") {
        const body    = await readBody(req);
        const payload = JSON.parse(body ?? "{}") as Partial<QaBusInboundMessage>;
    const msg: QaBusInboundMessage = {
        id:           payload.id ?? `inj-${Date.now()}`,
        conversation: {
          id:   (payload as any).conversationId ?? (payload as any).conversation?.id ?? "default",
          kind: (payload as any).chatType ?? (payload as any).conversation?.kind ?? "direct",
        },
        text:       payload.text           ?? "",
        senderId:   payload.senderId       ?? "user",
        senderName: payload.senderName     ?? "User",
        timestamp:  payload.timestamp      ?? Date.now(),
      };
        pushEvent({ kind: "inbound-message", message: msg });
        writeJson(res, 200, { message: msg });
        return;
      }

      // ── POST /v1/actions/* stubs ──────────────────────────────────────────
      if (req.method === "POST" && pathname.startsWith("/v1/actions/")) {
        writeJson(res, 200, { ok: true });
        return;
      }

      // ── Default catch-all ─────────────────────────────────────────────────
      console.warn(`[qa-bus] Unhandled ${req.method} ${pathname}`);
      await readBody(req); // drain
      writeJson(res, 404, { error: "not found" });

    } catch (err) {
      console.error(`[qa-bus] HTTP Error:`, err);
      if (!res.headersSent) {
        writeJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
    }
  });

  server.listen(QA_BUS_PORT, "127.0.0.1", () => {
    console.log(`[consumer] QA channel bus listening on 127.0.0.1:${QA_BUS_PORT}`);
  });
}

// ── Inbound consumer (RabbitMQ → qa-bus) ─────────────────────────────────────

async function startConsumer(): Promise<void> {
  const conn: AmqpConnection = await connectWithRetry();
  const ch: AmqpChannel      = await conn.createChannel();
  ch.prefetch(1);

  globalAmqChannel = ch;

  await ch.assertExchange(RABBITMQ_EXCHANGE, "topic", { durable: true });

  const queueName = `agent-${AGENT_ID}`;
  await ch.assertQueue(queueName, { durable: true });
  await ch.bindQueue(queueName, RABBITMQ_EXCHANGE, `agent.${AGENT_ID}`);

  console.log(`[consumer] Listening on queue "${queueName}" (exchange: ${RABBITMQ_EXCHANGE})`);

  ch.consume(queueName, async (msg: amqp.ConsumeMessage | null) => {
    if (!msg) return;

    let cmd: AgentCommand;
    try {
      cmd = JSON.parse(msg.content.toString()) as AgentCommand;
    } catch {
      console.error("[consumer] Invalid message format — nacking");
      ch.nack(msg, false, false);
      return;
    }

    console.log(`[consumer] Received action="${cmd.action}" sessionKey="${cmd.sessionKey}"`);

    try {
      let userText: string;
      if (cmd.action === "chat_message") {
        userText = String((cmd.payload as { content?: unknown }).content ?? JSON.stringify(cmd.payload));
      } else {
        userText = `Action: ${cmd.action}\n\nPayload:\n${JSON.stringify(cmd.payload, null, 2)}`;
      }

      // Build the qa-channel conversation ID — "dm:<sessionKey>"
      const conversationId = `dm:${cmd.sessionKey}`;

      // Build the inbound message in the exact format OpenClaw expects
      const qaBusMsg: QaBusInboundMessage = {
        id:           cmd.messageId || `msg-${Date.now()}`,
        conversation: {
          id:    cmd.sessionKey,   // sessionKey becomes the conversation ID
          kind:  "direct",
          title: "Kivo Chat",
        },
        text:      userText,
        senderId:  cmd.sessionKey,    // sessionKey as user identifier
        senderName: "User",
        timestamp:  Date.now(),
      };

      // Track the session so we can route the reply back
      activeSessions.set(cmd.sessionKey, { cmd, rabbitMsg: msg, conversationId });

      // Push the event into the qa-bus — OpenClaw will pick it up on next poll
      pushEvent({ kind: "inbound-message", message: qaBusMsg });
      console.log(`[qa-bus] Queued inbound-message event (conversationId=${conversationId})`);

      // Ack immediately — we don't hold the RabbitMQ message.
      // The reply is fire-and-kivot via /v1/outbound/message → RabbitMQ publish.
      ch.ack(msg);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[consumer] Error enqueuing message:", message);
      ch.nack(msg, false, true); // requeue
    }
  }, { noAck: false });
}

// ── Outbound send API (OpenClaw → other agents) ───────────────────────────────

let pubChannel: AmqpChannel | null = null;

async function ensurePubChannel(): Promise<AmqpChannel> {
  if (pubChannel) return pubChannel;
  const conn = await amqp.connect(buildAmqpUrl());
  pubChannel  = await conn.createChannel();
  return pubChannel;
}

async function startSendApi(): Promise<void> {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end(JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }

    try {
      const body = await readBody(req);
      const { targetAgentId, action, payload, sessionKey } = JSON.parse(body ?? "{}") as {
        targetAgentId?: string;
        action?:        string;
        payload?:       Record<string, unknown>;
        sessionKey?:    string;
      };

      if (!targetAgentId || !action) {
        res.writeHead(400).end(JSON.stringify({ error: "targetAgentId and action are required" }));
        return;
      }

      const messageId    = Math.random().toString(36).slice(2);
      const effectiveKey = sessionKey ?? `a2a-${messageId}`;
      const routingKey   = `agent.${targetAgentId}`;

      const command: AgentCommand = {
        tenantId:   RABBITMQ_VHOST.replace("/tenant-", ""),
        agentId:    targetAgentId,
        sessionKey: effectiveKey,
        messageId,
        action,
        payload:    payload ?? {},
      };

      const ch = await ensurePubChannel();
      ch.publish(
        RABBITMQ_EXCHANGE,
        routingKey,
        Buffer.from(JSON.stringify(command)),
        { contentType: "application/json", deliveryMode: 2 },
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ queued: true, messageId, targetAgentId, sessionKey: effectiveKey }));
      console.log(`[consumer] A2A: dispatched action="${action}" → agent "${targetAgentId}"`);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[consumer] Send API error:", message);
      res.writeHead(500).end(JSON.stringify({ error: message }));
    }
  });

  server.listen(SEND_API_PORT, "127.0.0.1", () => {
    console.log(`[consumer] Send API listening on 127.0.0.1:${SEND_API_PORT}`);
  });
}

// ── Entry ─────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log(`[consumer] Starting kivo-consumer for agent: ${AGENT_ID}`);
  await Promise.all([
    startConsumer(),
    startQaBusServer(),
    startSendApi(),
  ]);
}

main().catch((err: unknown) => {
  console.error("[consumer] Fatal error:", err);
  process.exit(1);
});
