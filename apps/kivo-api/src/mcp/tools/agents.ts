// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { internalFetch } from "../client";

export function registerAgentTools(server: McpServer, actor: any, authHeader: string) {
  server.tool(
    "add_daily_memory",
    "Record a summary of your conversations or important events in your daily memory. Use this to maintain context across sessions.",
    {
      agentId: z.string().optional().describe("Your Agent ID (Optional)"),
      text: z.string().describe("The memory content to save for today"),
    },
    async ({ agentId, text }) => {
      try {
        const resolvedAgentId = agentId || actor?.id;
        if (!resolvedAgentId || actor?.type === "human") throw new Error("Agent ID is required but could not be resolved or you are not an agent.");
        
        const data = await internalFetch(`/agents/${resolvedAgentId}/memory`, authHeader, {
          method: "POST",
          body: JSON.stringify({ text }),
        });
        
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );
}
