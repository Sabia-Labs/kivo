import { Router } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServerForActor } from "../mcp/server";
import { authMiddleware } from "../middleware/authMiddleware";

export const mcpRouter = Router();

// Store active SSE transports in memory
const transports = new Map<string, SSEServerTransport>();

mcpRouter.get("/sse", authMiddleware, async (req, res) => {
  try {
    const transport = new SSEServerTransport("/mcp/messages", res);
    
    // Create an MCP Server instance scoped to this agent/user connection
    const mcpServer = createMcpServerForActor(req.actor, req.headers.authorization!);
    await mcpServer.connect(transport);
    
    transports.set(transport.sessionId, transport);
    
    res.on("close", () => {
      transports.delete(transport.sessionId);
    });
  } catch (err) {
    console.error("Failed to establish MCP SSE connection", err);
    res.status(500).end();
  }
});

mcpRouter.post("/messages", authMiddleware, async (req, res) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).send("Missing sessionId");
    return;
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).send("Session not found");
    return;
  }
  
  await transport.handlePostMessage(req, res);
});
