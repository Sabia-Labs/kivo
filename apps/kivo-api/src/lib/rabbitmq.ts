import * as amqp from "amqplib";

/**
 * RabbitMQ management + messaging module.
 *
 * Responsibilities:
 *  1. Tenant provisioning — creates vhost/user/permissions via the HTTP Management API.
 *  2. Publishing — sends commands to a tenant agent via AMQP.
 *  3. Deprovisioning — removes vhost/user when a tenant is deleted.
 *
 * Tenant boundary model:
 *  - One vhost per workspace: /tenant-<workspaceId>
 *  - One user per workspace:  tenant-<workspaceId>-user
 *  - One topic exchange:      tenant-<workspaceId>-exchange
 *  - Per-agent queue:         agent-<agentId>  (bound by the consumer sidecar)
 *
 * Config (env vars):
 *  RABBITMQ_MANAGEMENT_URL  — e.g. http://kivo-rabbit.infra-messaging.svc.cluster.local:15672
 *  RABBITMQ_ADMIN_USER      — admin username
 *  RABBITMQ_ADMIN_PASSWORD  — admin password
 *  RABBITMQ_AMQP_HOST       — e.g. kivo-rabbit.infra-messaging.svc.cluster.local
 *  RABBITMQ_AMQP_PORT       — default 5672
 */

// ── Config ────────────────────────────────────────────────────────────────────

const MGMT_URL   = process.env.RABBITMQ_MANAGEMENT_URL ?? "http://localhost:15672";
const ADMIN_USER = process.env.RABBITMQ_ADMIN_USER     ?? "admin";
const ADMIN_PASS = process.env.RABBITMQ_ADMIN_PASSWORD ?? "admin";
const AMQP_HOST  = process.env.RABBITMQ_AMQP_HOST      ?? "localhost";
const AMQP_PORT  = Number(process.env.RABBITMQ_AMQP_PORT ?? "5672");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RabbitMQCredentials {
  host: string;
  amqpPort: number;
  vhost: string;
  username: string;
  password: string;
  exchange: string;
}

export interface AgentCommand {
  tenantId: string;
  agentId: string;
  sessionKey: string;   // = conversationId — maps to openclaw x-openclaw-session-key
  messageId: string;
  action: "chat_message" | "execute_task" | "delegate_task" | string;
  payload: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the vhost name for a workspace. */
export function tenantVhost(workspaceId: string): string {
  return `/tenant-${workspaceId}`;
}

/** Returns the AMQP user name for a workspace. */
export function tenantUser(workspaceId: string): string {
  return `tenant-${workspaceId}-user`;
}

/** Returns the topic exchange name for a workspace. */
export function tenantExchange(workspaceId: string): string {
  return `tenant-${workspaceId}-exchange`;
}

/** Returns the routing key for a specific agent. */
export function agentRoutingKey(agentId: string): string {
  return `agent.${agentId}`;
}

/** Returns the routing key for a reply to a specific session. */
export function replyRoutingKey(sessionKey: string): string {
  return `reply.${sessionKey}`;
}

/**
 * Returns RabbitMQ admin credentials configured for a specific workspace (tenant).
 * Useful for the API to publish messages and wait for replies using the global admin account.
 */
export function getAdminCredentialsForWorkspace(workspaceId: string): RabbitMQCredentials {
  return {
    host:     AMQP_HOST,
    amqpPort: AMQP_PORT,
    vhost:    tenantVhost(workspaceId),
    username: ADMIN_USER,
    password: ADMIN_PASS,
    exchange: tenantExchange(workspaceId),
  };
}

/**
 * Makes an authenticated HTTP call to the RabbitMQ Management API.
 * Uses the built-in Basic Auth over HTTP (management plugin must be enabled).
 */
async function mgmtRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const creds    = Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString("base64");
  const url      = `${MGMT_URL}/api/${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization:  `Basic ${creds}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

/**
 * Checks if the RabbitMQ Management API is ready and responding.
 */
export async function checkManagementApiReady(): Promise<boolean> {
  try {
    const res = await mgmtRequest("GET", "overview");
    return res.ok;
  } catch (err) {
    return false;
  }
}

// ── Tenant provisioning ───────────────────────────────────────────────────────

/**
 * Provisions a new tenant in RabbitMQ:
 *  1. Creates vhost  /tenant-<workspaceId>
 *  2. Creates user   tenant-<workspaceId>-user  with a random password
 *  3. Grants full permissions on the vhost to the user
 *  4. Declares the topic exchange (idempotent via AMQP)
 *
 * Returns the credentials to be stored as a K8s Secret in the tenant namespace.
 * Idempotent — safe to call multiple times (204 / 200 on re-creation are both OK).
 */
export async function provisionTenant(workspaceId: string): Promise<RabbitMQCredentials> {
  const vhost    = tenantVhost(workspaceId);
  const username = tenantUser(workspaceId);
  const exchange = tenantExchange(workspaceId);
  const password = generatePassword();

  // 1. Create vhost
  const vhostRes = await mgmtRequest("PUT", `vhosts/${encodeURIComponent(vhost)}`);
  if (!vhostRes.ok && vhostRes.status !== 204) {
    throw new Error(`RabbitMQ: failed to create vhost ${vhost}: ${vhostRes.status} ${vhostRes.text}`);
  }

  // 2. Create user
  const userRes = await mgmtRequest("PUT", `users/${encodeURIComponent(username)}`, {
    password,
    tags: "monitoring",   // read-only management UI access (no admin)
  });
  if (!userRes.ok && userRes.status !== 204) {
    throw new Error(`RabbitMQ: failed to create user ${username}: ${userRes.status} ${userRes.text}`);
  }

  // 3. Set full permissions on the vhost for the tenant user
  const permRes = await mgmtRequest(
    "PUT",
    `permissions/${encodeURIComponent(vhost)}/${encodeURIComponent(username)}`,
    { configure: ".*", write: ".*", read: ".*" },
  );
  if (!permRes.ok && permRes.status !== 204) {
    throw new Error(`RabbitMQ: failed to set permissions: ${permRes.status} ${permRes.text}`);
  }

  // 3b. Also grant full permissions to the admin user on this vhost.
  //     The kivo-api uses the admin user credentials to publish messages (publishToAgent,
  //     waitForReply). Without this the admin gets 403 ACCESS_REFUSED on the tenant vhost.
  const adminPermRes = await mgmtRequest(
    "PUT",
    `permissions/${encodeURIComponent(vhost)}/${encodeURIComponent(ADMIN_USER)}`,
    { configure: ".*", write: ".*", read: ".*" },
  );
  if (!adminPermRes.ok && adminPermRes.status !== 204) {
    // Non-fatal: log and continue — tenant user still works for the sidecar
    console.warn(`[rabbitmq] Failed to set admin permissions on ${vhost}: ${adminPermRes.status}`);
  }

  // 4. Declare the topic exchange via AMQP (idempotent)
  await declareExchange(vhost, username, password, exchange);

  return {
    host:     AMQP_HOST,
    amqpPort: AMQP_PORT,
    vhost,
    username,
    password,
    exchange,
  };
}

/**
 * Removes the tenant's vhost and user from RabbitMQ.
 * The vhost deletion cascades — all queues/exchanges/bindings inside are removed.
 * Safe to call even if the vhost/user no longer exist (404 treated as success).
 */
export async function deprovisionTenant(workspaceId: string): Promise<void> {
  const vhost    = tenantVhost(workspaceId);
  const username = tenantUser(workspaceId);

  const vhostRes = await mgmtRequest("DELETE", `vhosts/${encodeURIComponent(vhost)}`);
  if (!vhostRes.ok && vhostRes.status !== 404) {
    throw new Error(`RabbitMQ: failed to delete vhost ${vhost}: ${vhostRes.status}`);
  }

  const userRes = await mgmtRequest("DELETE", `users/${encodeURIComponent(username)}`);
  if (!userRes.ok && userRes.status !== 404) {
    throw new Error(`RabbitMQ: failed to delete user ${username}: ${userRes.status}`);
  }
}

// ── Publishing ────────────────────────────────────────────────────────────────

/**
 * Publishes an AgentCommand to the tenant exchange.
 * The consumer sidecar in the target agent's pod will receive and process it.
 *
 * Routing key: agent.<agentId>
 *
 * Opens a fresh connection per call (low-traffic control plane).
 * For high-throughput paths, consider a shared channel pool.
 */
export async function publishToAgent(
  creds: Pick<RabbitMQCredentials, "host" | "amqpPort" | "vhost" | "username" | "password" | "exchange">,
  command: AgentCommand,
): Promise<void> {
  const url  = buildAmqpUrl(creds);
  const conn = await amqp.connect(url);
  const ch   = await conn.createConfirmChannel();
  try {
    console.log(`[rabbitmq] Publishing to exchange: ${creds.exchange}, routingKey: agent.${command.agentId}`);
    ch.publish(
      creds.exchange,
      agentRoutingKey(command.agentId),
      Buffer.from(JSON.stringify(command)),
      {
        contentType:   "application/json",
        deliveryMode:  2,               // persistent
        correlationId: command.messageId,
        replyTo:       `reply.${command.sessionKey}`,
      },
    );
    await ch.waitForConfirms();
    console.log(`[rabbitmq] publish synchronous result: confirmed`);
  } finally {
    // We can safely close now that confirms have arrived.
    await ch.close().catch(() => { /* ignore */ });
    setTimeout(() => conn.close().catch(() => { /* ignore */ }), 200);
  }
}


/**
 * Waits for a reply message on the reply queue for a given sessionKey.
 * Creates a temporary exclusive queue bound to reply.<sessionKey>.
 *
 * @param creds  Tenant AMQP credentials (admin user can connect to any vhost).
 * @param sessionKey  The conversationId that becomes the openclaw session key.
 * @param timeoutMs  Max wait time in ms (default 30_000 = 30s).
 * @returns The raw reply string from openclaw, or null on timeout.
 */
export async function waitForReply(
  creds: Pick<RabbitMQCredentials, "host" | "amqpPort" | "vhost" | "username" | "password" | "exchange">,
  sessionKey: string,
  timeoutMs = 30_000,
): Promise<string | null> {
  const url  = buildAmqpUrl(creds);
  const conn = await amqp.connect(url);

  const closeConn = () => {
    // Fire-and-kivot — amqplib 0.10.x conn.close() can block indefinitely.
    setTimeout(() => conn.close().catch(() => { /* ignore */ }), 200);
  };

  try {
    const ch = await conn.createChannel();

    // Declare an exclusive, auto-delete reply queue for this session
    const replyQueue = `reply-api-${sessionKey}`;
    await ch.assertQueue(replyQueue, { exclusive: false, autoDelete: true, durable: false });
    await ch.bindQueue(replyQueue, creds.exchange, replyRoutingKey(sessionKey));

    return await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        ch.close().catch(() => {});
        closeConn();
        resolve(null);
      }, timeoutMs);

      ch.consume(
        replyQueue,
        (msg: amqp.ConsumeMessage | null) => {
          if (!msg) return;
          clearTimeout(timer);
          ch.ack(msg);
          resolve(msg.content.toString());
          ch.close().catch(() => {});
          closeConn();
        },
        { noAck: false },
      );
    });
  } catch (err) {
    closeConn();
    throw err;
  }
}


// ── Internal helpers ──────────────────────────────────────────────────────────

/** Declares the topic exchange inside the tenant vhost. Idempotent. */
async function declareExchange(
  vhost: string,
  username: string,
  password: string,
  exchange: string,
): Promise<void> {
  const creds = { host: AMQP_HOST, amqpPort: AMQP_PORT, vhost, username, password, exchange };
  const url   = buildAmqpUrl(creds);
  const conn  = await amqp.connect(url);
  const ch    = await conn.createChannel();
  await ch.assertExchange(exchange, "topic", { durable: true });
  ch.close().catch(() => {});
  // Fire-and-kivot — amqplib 0.10.x conn.close() can block indefinitely.
  setTimeout(() => conn.close().catch(() => {}), 200);
}


/** Builds the AMQP connection URL from credentials. */
function buildAmqpUrl(
  creds: Pick<RabbitMQCredentials, "host" | "amqpPort" | "vhost" | "username" | "password">,
): string {
  const vhostEncoded = encodeURIComponent(creds.vhost);
  return `amqp://${encodeURIComponent(creds.username)}:${encodeURIComponent(creds.password)}@${creds.host}:${creds.amqpPort}/${vhostEncoded}`;
}

/** Generates a cryptographically random 32-character password. */
function generatePassword(): string {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(24).toString("base64url");
}
