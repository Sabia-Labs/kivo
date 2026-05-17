// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { internalFetch } from "../client";

export function registerTaskTools(server: McpServer, actor: any, authHeader: string) {
  server.tool(
    "list_tasks",
    "List all tasks for a team",
    {
      teamId: z.string().optional().describe("The ID of the team (Optional, defaults to your own team)"),
    },
    async ({ teamId }) => {
      try {
        const resolvedTeamId = teamId || actor?.teamId;
        if (!resolvedTeamId) throw new Error("teamId is required but could not be resolved from your context.");
        const data = await internalFetch(`/tasks/by-team/${resolvedTeamId}`, authHeader);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );


  server.tool(
    "get_task",
    "Get a single task by ID or identifier (e.g. PRD-1)",
    {
      idOrIdentifier: z.string().describe("The ID or human-readable identifier of the task"),
    },
    async ({ idOrIdentifier }) => {
      try {
        const data = await internalFetch(`/tasks/${idOrIdentifier}`, authHeader);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );

  server.tool(
    "create_task",
    "Create a new task for a team",
    {
      teamId: z.string().optional().describe("The ID of the team (Optional, defaults to your own team)"),
      title: z.string().describe("The title of the task"),
      plan: z.string().optional().describe("The agent's plan to accomplish the task"),
      taskList: z.string().optional().describe("A markdown or text list of steps/to-dos to follow during execution"),
      prompt: z.string().optional().describe("Command/instruction describing what to do"),
      instructions: z.string().optional().describe("Guidelines and how to execute this task"),
      workSummary: z.string().optional().describe("Final summary of what was done"),
      result: z.string().optional().describe("The deliverable or final outcome/result of the work done (Optional, only populate if status is 'success')"),
      failureReason: z.string().optional().describe("The reason or explanation for why the task failed or was blocked (Optional, only populate if status is 'failed')"),
      assignedToId: z.string().optional().describe("Agent ID or User ID assigned to the task"),
      requestId: z.string().optional().describe("ID of the request this task is fulfilling"),
      status: z.enum(["open", "in_progress", "success", "failed"]).optional().describe("Current status of the task. Set to 'success' or 'failed' when finished."),

    },
    async (params) => {
      try {
        const resolvedTeamId = params.teamId || actor?.teamId;
        if (!resolvedTeamId) throw new Error("teamId is required but could not be resolved from your context.");
        
        const payload = { ...params, teamId: resolvedTeamId };
        const data = await internalFetch(`/tasks`, authHeader, {
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
    "update_task",
    "Update an existing task by ID or identifier",
    {
      idOrIdentifier: z.string().describe("The ID or human-readable identifier of the task"),
      title: z.string().optional(),
      plan: z.string().optional(),
      taskList: z.string().optional(),
      prompt: z.string().optional(),
      instructions: z.string().optional(),
      workSummary: z.string().optional(),
      result: z.string().optional().describe("The deliverable or final outcome/result of the work done (Optional, only populate if status is 'success')"),
      failureReason: z.string().optional().describe("The reason or explanation for why the task failed or was blocked (Optional, only populate if status is 'failed')"),
      assignedToId: z.string().optional(),
      requestId: z.string().optional(),
      status: z.enum(["open", "in_progress", "success", "failed"]).optional(),

    },
    async ({ idOrIdentifier, ...body }) => {
      try {
        const data = await internalFetch(`/tasks/${idOrIdentifier}`, authHeader, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );

  server.tool(
    "delete_task",
    "Delete a task by ID or identifier",
    {
      idOrIdentifier: z.string().describe("The ID or human-readable identifier of the task"),
    },
    async ({ idOrIdentifier }) => {
      try {
        const data = await internalFetch(`/tasks/${idOrIdentifier}`, authHeader, {
          method: "DELETE",
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );

  server.tool(
    "list_task_comments",
    "List comments for a task",
    {
      idOrIdentifier: z.string().describe("The ID or human-readable identifier of the task"),
    },
    async ({ idOrIdentifier }) => {
      try {
        const data = await internalFetch(`/tasks/${idOrIdentifier}/comments`, authHeader);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );

  server.tool(
    "create_task_comment",
    "Create a comment on a task",
    {
      idOrIdentifier: z.string().describe("The ID or human-readable identifier of the task"),
      content: z.string().describe("The comment body"),
    },
    async ({ idOrIdentifier, content }) => {
      try {
        const data = await internalFetch(`/tasks/${idOrIdentifier}/comments`, authHeader, {
          method: "POST",
          body: JSON.stringify({ content }),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
  );
}
