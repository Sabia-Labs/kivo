// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { internalFetch } from "../client";

export function registerRequestTools(server: McpServer, actor: any, authHeader: string) {
  server.tool(
    "list_requests",
    "List team requests (work requests for agents or team members)",
    {
      teamId: z.string().optional().describe("The ID of the team (Optional, defaults to your own team)"),
      targetAgentId: z.string().uuid().optional().describe("Filter by the target agent ID (e.g., your own UUID) to only see your requests"),
      status: z.string().optional().describe("Filter by status (e.g. 'open', 'in_progress', 'completed')"),
    },
    async ({ teamId, targetAgentId, status }) => {
      try {
        const resolvedTeamId = teamId || actor?.teamId;
        if (!resolvedTeamId) throw new Error("teamId is required but could not be resolved from your context.");
        let url = `/teams/${resolvedTeamId}/requests?`;
        if (status) url += `status=${status}&`;
        if (targetAgentId) url += `targetAgentId=${targetAgentId}&`;
        const data = await internalFetch(url, authHeader);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );

  server.tool(
    "get_request",
    "Get details of a specific request",
    {
      teamId: z.string().optional().describe("The ID of the team (Optional, defaults to your own team)"),
      requestId: z.string().describe("The ID of the request"),
    },
    async ({ teamId, requestId }) => {
      try {
        const resolvedTeamId = teamId || actor?.teamId;
        if (!resolvedTeamId) throw new Error("teamId is required but could not be resolved from your context.");
        const data = await internalFetch(`/teams/${resolvedTeamId}/requests/${requestId}`, authHeader);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );

  server.tool(
    "create_request",
    "Create a new request for another agent in the team",
    {
      teamId: z.string().optional().describe("The ID of the team (Optional, defaults to your own team)"),
      title: z.string().describe("A brief summary or title of what this request is about"),
      targetAgentId: z.string().uuid().describe("The ID of the target agent that will process this request"),
      requestDetails: z.string().optional().describe("Input data or context for the target agent (Markdown string)"),
      capabilitiesWorkflow: z.any().optional().describe("Array of capability identifiers involved in this request"),
      state: z.array(z.string()).optional().describe("Array of string contexts indicating the current state or relevant context"),
      priority: z.number().int().min(0).max(4).optional().describe("Priority level (0-4)"),

      parentRequestId: z.string().optional().describe("If this request is a child of another request, provide the parent request identifier or UUID"),
    },
    async ({ teamId, ...rest }) => {
      try {
        const resolvedTeamId = teamId || actor?.teamId;
        if (!resolvedTeamId) throw new Error("teamId is required but could not be resolved from your context.");
        const payload = { requesterId: actor.id, ...rest };
        const data = await internalFetch(`/teams/${resolvedTeamId}/requests`, authHeader, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );

  server.tool(
    "update_request_status",
    "Update the status of a request",
    {
      teamId: z.string().optional().describe("The ID of the team (Optional, defaults to your own team)"),
      requestId: z.string().describe("The ID of the request"),
      status: z.enum(["draft", "open", "in_progress", "waiting_user", "success", "failed"]).describe("The new status. Use 'failed' to reject/fail the request, and 'success' to mark as completed successfully."),
      response: z.string().optional().describe("Data or result payload returned upon completion or rejection (e.g., the reason for rejection)"),
    },
    async ({ teamId, requestId, status, response }) => {
      try {
        const resolvedTeamId = teamId || actor?.teamId;
        if (!resolvedTeamId) throw new Error("teamId is required but could not be resolved from your context.");
        const payload = { status, response };
        const data = await internalFetch(`/teams/${resolvedTeamId}/requests/${requestId}`, authHeader, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );
}
