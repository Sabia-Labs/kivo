#!/usr/bin/env node
/**
 * kivo-consumer — HTTP Push Gateway (Sidecar)
 *
 * Replaces RabbitMQ with a direct HTTP Push architecture.
 *
 * responsibilities:
 *  A. INBOUND (kivo-api → Consumer):
 *     - Listens on 0.0.0.0:43124 for incoming messages from kivo-api.
 *     - Validates requests using INTERNAL_SERVICE_TOKEN.
 *     - Enqueues messages in the qa-channel bus.
 *
 *  B. POLLING (OpenClaw → Consumer):
 *     - OpenClaw polls POST 127.0.0.1:43123/v1/poll to receive events.
 *
 *  C. OUTBOUND (OpenClaw → Consumer → kivo-api):
 *     - OpenClaw sends reply text to POST 127.0.0.1:43123/v1/outbound/message.
 *     - We forward the reply back to kivo-api via HTTP POST.
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const AGENT_ID               = process.env.AGENT_ID               ?? "";
const INTERNAL_TOKEN         = process.env.INTERNAL_SERVICE_TOKEN ?? "";
const KIVO_API_INTERNAL_URL  = process.env.KIVO_API_INTERNAL_URL  ?? "http://kivo-api:4000";
const LOCAL_BUS_PORT         = 43123; // Loopback only (Secure)
const EXTERNAL_PUSH_PORT     = 43124; // Cluster-wide (Protected by token)
const WORKSPACE_DIR         = process.env.OPENCLAW_WORKSPACE_DIR ?? "/home/node/.openclaw/workspace";

if (!AGENT_ID) {
  console.error("[consumer] FATAL: AGENT_ID env var is required");
  process.exit(1);
}

if (!INTERNAL_TOKEN) {
  console.warn("[consumer] WARNING: INTERNAL_SERVICE_TOKEN not set. External push will be insecure!");
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface QaBusConversation {
  id:    string;              // sessionKey
  kind:  "direct" | "channel"; 
  title?: string;
}

interface QaBusInboundMessage {
  id:           string;          
  conversation: QaBusConversation;
  text:         string;
  senderId:     string;
  senderName:   string;
  timestamp:    number;
}

interface QaBusPollEvent {
  kind:    "inbound-message";
  message: QaBusInboundMessage;
}

interface QaBusPollResponse {
  cursor: number;
  events: QaBusPollEvent[];
}

// ── Local Bus State ───────────────────────────────────────────────────────────

const eventQueue: QaBusPollEvent[] = [];
let   globalCursor = 0;

type PollWaiter = {
  resolve: (response: QaBusPollResponse) => void;
  timer:   ReturnType<typeof setTimeout>;
};
const pollWaiters: PollWaiter[] = [];

/** Enqueue an event and wake up any long-polling OpenClaw instance */
function pushEvent(event: QaBusPollEvent): void {
  eventQueue.push(event);
  globalCursor += 1;
  const cursor = globalCursor;

  const waiters = pollWaiters.splice(0);
  for (const w of waiters) {
    clearTimeout(w.timer);
    w.resolve({ cursor, events: [event] });
  }
}

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

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

// ── Local Server (127.0.0.1:43123) ────────────────────────────────────────────
// Accessible only by the agent container in the same pod.

async function startLocalServer(): Promise<void> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost`);
    const pathname = url.pathname;

    try {
      // ── GET /health ─────────────────────────────────────────────────────
      if (req.method === "GET" && pathname === "/health") {
        return writeJson(res, 200, { status: "ok" });
      }

      // ── POST /v1/poll ─────────────────────────────────────────────────────
      if (req.method === "POST" && pathname === "/v1/poll") {
        const body = await readBody(req);
        let pollReq: { cursor?: number; timeoutMs?: number } = {};
        try { pollReq = JSON.parse(body); } catch { }

        const clientCursor = pollReq.cursor ?? 0;
        const timeoutMs    = Math.min(pollReq.timeoutMs ?? 5_000, 30_000);

        if (globalCursor > clientCursor && eventQueue.length > 0) {
          return writeJson(res, 200, {
            cursor: globalCursor,
            events: eventQueue.splice(0),
          });
        }

        await new Promise<void>((resolve) => {
          let responded = false;
          const timer = setTimeout(() => {
            if (responded) return;
            responded = true;
            const idx = pollWaiters.findIndex((w) => w.timer === timer);
            if (idx >= 0) pollWaiters.splice(idx, 1);
            writeJson(res, 200, { cursor: globalCursor, events: [] });
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
      // Agent sends reply back to us. We forward it to kivo-api.
      if (req.method === "POST" && pathname === "/v1/outbound/message") {
        const body = await readBody(req);
        const payload = JSON.parse(body) as { to: string; text: string };
        
        console.log(`[local-bus] Agent reply → kivo-api: session=${payload.to}`);

        try {
            const apiRes = await fetch(`${KIVO_API_INTERNAL_URL}/internal/v1/agents/${AGENT_ID}/messages`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "x-internal-token": INTERNAL_TOKEN
                },
                body: JSON.stringify({
                    sessionKey: payload.to,
                    content: payload.text,
                    role: "assistant"
                })
            });
            if (!apiRes.ok) throw new Error(`API returned ${apiRes.status}`);
            
            writeJson(res, 200, { message: { id: `out-${Date.now()}` } });
        } catch (err) {
            console.error(`[local-bus] Failed to forward reply to kivo-api:`, err);
            writeJson(res, 500, { error: "upstream_failure" });
        }
        return;
      }

      writeJson(res, 404, { error: "not_found" });
    } catch (err) {
      console.error(`[local-bus] Error:`, err);
      writeJson(res, 500, { error: "internal_error" });
    }
  });

  server.listen(LOCAL_BUS_PORT, "127.0.0.1", () => {
    console.log(`[consumer] Local bus listening on 127.0.0.1:${LOCAL_BUS_PORT}`);
  });
}

// ── External Server (0.0.0.0:43124) ───────────────────────────────────────────
// Accessible by kivo-api within the cluster.

async function startExternalServer(): Promise<void> {
  const server = http.createServer(async (req, res) => {
    // ── Security Check ──────────────────────────────────────────────────
    const token = req.headers["x-internal-token"];
    if (INTERNAL_TOKEN && token !== INTERNAL_TOKEN) {
      console.warn(`[external-push] Unauthorized request from ${req.socket.remoteAddress}`);
      return writeJson(res, 401, { error: "unauthorized" });
    }

    const pathname = new URL(req.url ?? "/", `http://localhost`).pathname;

    try {
      // ── GET /v1/files/:filename ──────────────────────────────────────────
      if (req.method === "GET" && pathname.startsWith("/v1/files/")) {
        const filename = pathname.replace("/v1/files/", "");
        
        // Safety: only allow specific markdown files to prevent path traversal
        const allowedFiles = [
          "IDENTITY.md", "SOUL.md", "PROCESS.MD", "USER.md", 
          "MEMORY.md", "TOOLS.md", "HEARTBEAT.md", "AGENTS.md", "SAFETY.md"
        ];
        
        if (!allowedFiles.includes(filename)) {
          return writeJson(res, 403, { error: "forbidden_file" });
        }

        const filePath = path.join(WORKSPACE_DIR, filename);
        
        if (!fs.existsSync(filePath)) {
          return writeJson(res, 404, { error: "file_not_found" });
        }

        const content = fs.readFileSync(filePath, "utf-8");
        return writeJson(res, 200, { filename, content });
      }

      // ── POST /v1/inbound/message ─────────────────────────────────────────
      if (req.method === "POST" && pathname === "/v1/inbound/message") {
        const body = await readBody(req);
        const payload = JSON.parse(body) as { sessionKey: string; content: string; messageId: string };

        const msg: QaBusInboundMessage = {
          id:           payload.messageId || `msg-${Date.now()}`,
          conversation: { id: payload.sessionKey, kind: "direct", title: "Kivo Chat" },
          text:         payload.content,
          senderId:     payload.sessionKey,
          senderName:   "User",
          timestamp:    Date.now(),
        };

        pushEvent({ kind: "inbound-message", message: msg });
        console.log(`[external-push] Delivered message to agent: session=${payload.sessionKey}`);
        return writeJson(res, 200, { success: true });
      }

      writeJson(res, 404, { error: "not_found" });
    } catch (err) {
      console.error(`[external-push] Error:`, err);
      writeJson(res, 500, { error: "internal_error" });
    }
  });

  server.listen(EXTERNAL_PUSH_PORT, "0.0.0.0", () => {
    console.log(`[consumer] External push server listening on 0.0.0.0:${EXTERNAL_PUSH_PORT}`);
  });
}

// ── Entry ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀 Kivo Consumer Revolution — Agent: ${AGENT_ID}`);
  await Promise.all([
    startLocalServer(),
    startExternalServer()
  ]);
}

main().catch(err => {
  console.error("[consumer] Fatal startup error:", err);
  process.exit(1);
});
