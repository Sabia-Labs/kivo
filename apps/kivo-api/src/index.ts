import "dotenv/config";
import express from "express";
import cors from "cors";
import { teamsRouter } from "./routes/teams";
import { agentsRouter } from "./routes/agents";
import { authRouter } from "./routes/auth";
import { integrationsRouter } from "./routes/integrations";
import { conversationsRouter } from "./routes/conversations";
import { internalRouter } from "./routes/internal";
import { errorHandler } from "./middleware/errorHandler";
import { tasksRouter } from "./routes/tasks";
import { teamManagementRouter } from "./routes/team-management";
import { mcpRouter } from "./routes/mcp";
import { metaRouter } from "./routes/meta";
import { notificationsRouter } from "./routes/notifications";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

// ── Middleware ─────────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use((req, res, next) => {
  // Bypass express.json() for MCP messages route because the SDK needs the raw HTTP stream
  if (req.originalUrl.startsWith('/mcp/messages') || req.path === '/mcp/messages') {
    return next();
  }
  express.json()(req, res, next);
});

// Enforce Content-Type for mutations to help agents/users debug missing headers
app.use((req, res, next) => {
  // Bypass this enforcement for MCP messages
  if (req.originalUrl.startsWith('/mcp/messages') || req.path === '/mcp/messages') {
    return next();
  }
  if ((req.method === "POST" || req.method === "PUT") && !req.is("application/json")) {
    res.status(415).json({
      success: false,
      error: "Unsupported Media Type. You MUST send 'Content-Type: application/json' header.",
    });
    return;
  }
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────

// Internal routes — system level, no auth required (protected by NetworkPolicy)
app.use("/internal", internalRouter);

// Unified Actors Endpoints (Agentes e Humanos usam os mesmos caminhos)
app.use("/team", teamManagementRouter);
app.use("/tasks", tasksRouter);

// Legacy/Core routers (predominantly for humans or specific lifecycle)
app.use("/auth", authRouter);
app.use("/teams", teamsRouter); // Legacy team listing for humans
app.use("/agents", agentsRouter); // Lifecycle management (creation/deletion)
app.use("/conversations", conversationsRouter);
app.use("/teams/:id/integrations", integrationsRouter);
app.use("/mcp", mcpRouter);
app.use("/meta", metaRouter);
app.use("/notifications", notificationsRouter);

// ── Global error handler ──────────────────────────────────────────────────────

app.use(errorHandler);

// ── Listen ────────────────────────────────────────────────────────────────────

const HOST = process.env.HOST ?? "127.0.0.1";

app.listen(PORT, HOST, async () => {
  console.log(`🚀 Kivo API running on http://${HOST}:${PORT}`);

  // ── Template Seed (Sync from Control Plane) ─────────────────────────────────
  const { runTemplateSeed } = await import("./lib/templateSeed");
  await runTemplateSeed();
});

export default app;
