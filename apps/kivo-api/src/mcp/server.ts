import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTaskTools } from "./tools/tasks";
import { registerTeamTools } from "./tools/teams";
import { registerRequestTools } from "./tools/requests";
import { registerCapabilityTools } from "./tools/capabilities";

export function createMcpServerForActor(actor: any, authHeader: string) {
  const server = new McpServer({
    name: "Kivo MCP Server",
    version: "1.0.0",
  });

  // Register all tools and pass down the connection context
  registerTaskTools(server, actor, authHeader);
  registerTeamTools(server, actor, authHeader);
  registerRequestTools(server, actor, authHeader);
  registerCapabilityTools(server, actor, authHeader);

  return server;
}
