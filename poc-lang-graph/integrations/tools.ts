import { tool } from "@langchain/core/tools";
import { z } from "zod";

export function getToolsForAdapters(connectorAdapters: Record<string, any>) {
  const tools: any[] = [];

  const ticketing = connectorAdapters["ticketing"];
  if (ticketing) {
    tools.push(
      tool(
        async ({ projectId, states }) => {
          const result = await ticketing.searchTickets(projectId, states);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
        {
          name: "ticketing_search_issues",
          description: "Searches for active customer backlog tickets in a specific project in Linear.",
          schema: z.object({
            projectId: z.string().optional().describe("The unique project ID or name (e.g. 'Customer Support') to filter by."),
            states: z.array(z.string()).optional().describe("Filter issues by state names (e.g. ['Backlog']).")
          })
        }
      ),
      tool(
        async ({ id }) => {
          const result = await ticketing.getTicketDetails(id);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
        {
          name: "ticketing_get_details",
          description: "Retrieves the full context of a customer ticket, including its title, description, history, and status.",
          schema: z.object({
            id: z.string().describe("The unique identifier of the ticket (e.g., KVO-110).")
          })
        }
      ),
      tool(
        async ({ issueId, body }) => {
          const result = await ticketing.addReply(issueId, body);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
        {
          name: "ticketing_add_public_reply",
          description: "Posts a public response to the customer. This will be visible on the ticket.",
          schema: z.object({
            issueId: z.string().describe("The unique identifier of the ticket."),
            body: z.string().describe("The markdown formatted text message to send to the customer.")
          })
        }
      ),
      tool(
        async ({ ticketId, status }) => {
          const result = await ticketing.updateStatus(ticketId, status);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
        {
          name: "ticketing_update_status",
          description: "Changes the workflow state of the ticket (e.g., 'In Progress', 'Done', 'Escalated').",
          schema: z.object({
            ticketId: z.string().describe("The unique identifier of the ticket."),
            status: z.string().describe("The new status name (e.g., 'In Progress').")
          })
        }
      )
    );
  }

  const project = connectorAdapters["project"];
  if (project) {
    tools.push(
      tool(
        async ({ id }) => {
          const result = await project.getTaskDetails(id);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
        {
          name: "project_get_details",
          description: "Retrieves the full details of a project task or issue by ID.",
          schema: z.object({
            id: z.string().describe("The unique identifier of the task (e.g., KVO-110).")
          })
        }
      ),
      tool(
        async ({ id, text }) => {
          const result = await project.addComment(id, text);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
        {
          name: "project_add_comment",
          description: "Adds an internal comment/reply to a project task.",
          schema: z.object({
            id: z.string().describe("The unique task ID to add the comment to."),
            text: z.string().describe("The body text of the comment.")
          })
        }
      ),
      tool(
        async ({ id, state }) => {
          const result = await project.updateTaskState(id, state);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
        {
          name: "project_update_state",
          description: "Changes the workflow status of a task in the project management system.",
          schema: z.object({
            id: z.string().describe("The unique identifier of the task."),
            state: z.string().describe("The new state name (e.g., 'In Progress', 'Done').")
          })
        }
      ),
      tool(
        async ({ projectId }) => {
          const result = await project.listBacklog(projectId);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
        {
          name: "project_list_backlog",
          description: "Lists all current tasks in the backlog or to-do state for a specific project.",
          schema: z.object({
            projectId: z.string().optional().describe("The unique project ID.")
          })
        }
      )
    );
  }

  const kb = connectorAdapters["knowledge_base"];
  if (kb) {
    tools.push(
      tool(
        async ({ query }) => {
          const result = await kb.search(query);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
        {
          name: "knowledge_base_search",
          description: "Performs a semantic search across the company's internal wiki and past tickets to find troubleshooting guides or SOPs.",
          schema: z.object({
            query: z.string().describe("The search query keywords or ticket ID to find matching historical cases.")
          })
        }
      )
    );
  }

  return tools;
}
