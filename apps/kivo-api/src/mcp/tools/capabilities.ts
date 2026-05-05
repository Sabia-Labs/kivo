// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { internalFetch } from "../client";

export function registerCapabilityTools(server: McpServer, actor: any, authHeader: string) {
  server.tool(
    "list_capabilities",
    "List all capabilities available for a team",
    {
      teamId: z.string().optional().describe("The ID of the team (Optional, defaults to your own team)"),
    },
    async ({ teamId }) => {
      try {
        const resolvedTeamId = teamId || actor?.teamId;
        if (!resolvedTeamId) throw new Error("teamId is required but could not be resolved from your context.");
        const data = await internalFetch(`/teams/${resolvedTeamId}/capabilities`, authHeader);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );

  server.tool(
    "get_capability_by_identifier",
    "Get details of a specific team capability by its identifier",
    {
      teamId: z.string().optional().describe("The ID of the team (Optional, defaults to your own team)"),
      identifier: z.string().describe("The string identifier of the capability (e.g. 'verify-weather')"),
    },
    async ({ teamId, identifier }) => {
      try {
        const resolvedTeamId = teamId || actor?.teamId;
        if (!resolvedTeamId) throw new Error("teamId is required but could not be resolved from your context.");
        // Fetch all capabilities for the team and filter by identifier
        const response = await internalFetch(`/teams/${resolvedTeamId}/capabilities`, authHeader);
        const capabilities = response.data;
        
        if (Array.isArray(capabilities)) {
          const cap = capabilities.find((c: any) => c.identifier === identifier);
          if (!cap) {
            return { isError: true, content: [{ type: "text", text: `Could not execute the request, because the capability '${identifier}' was not found.` }] };
          }
          return { content: [{ type: "text", text: JSON.stringify(cap, null, 2) }] };
        }
        
        return { isError: true, content: [{ type: "text", text: "Invalid response from server" }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );
}
