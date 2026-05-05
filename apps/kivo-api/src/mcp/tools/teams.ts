// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { internalFetch } from "../client";

export function registerTeamTools(server: McpServer, actor: any, authHeader: string) {
  server.tool(
    "get_team",
    "Get details of a team by ID",
    {
      teamId: z.string().optional().describe("The ID of the team (Optional, defaults to your own team)"),
    },
    async ({ teamId }) => {
      try {
        const resolvedTeamId = teamId || actor?.teamId;
        if (!resolvedTeamId) throw new Error("teamId is required but could not be resolved from your context.");
        const data = await internalFetch(`/team?teamId=${resolvedTeamId}`, authHeader);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );

  server.tool(
    "update_team",
    "Update a team's details",
    {
      teamId: z.string().optional().describe("The ID of the team (Optional, defaults to your own team)"),
      name: z.string().optional().describe("New name of the team"),
    },
    async ({ teamId, name }) => {
      try {
        const resolvedTeamId = teamId || actor?.teamId;
        if (!resolvedTeamId) throw new Error("teamId is required but could not be resolved from your context.");
        const payload = { name };
        const data = await internalFetch(`/team?teamId=${resolvedTeamId}`, authHeader, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );

  server.tool(
    "list_team_members",
    "List all members (humans and agents) in a team",
    {
      teamId: z.string().optional().describe("The ID of the team (Optional, defaults to your own team)"),
    },
    async ({ teamId }) => {
      try {
        const resolvedTeamId = teamId || actor?.teamId;
        if (!resolvedTeamId) throw new Error("teamId is required but could not be resolved from your context.");
        const data = await internalFetch(`/team/members?teamId=${resolvedTeamId}`, authHeader);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );
}
