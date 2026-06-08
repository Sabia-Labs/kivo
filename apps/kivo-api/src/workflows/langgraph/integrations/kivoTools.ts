import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { db } from "../../../db/client";
import { teams, agents, requests, teamCapabilities } from "../../../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { runRequestIngestion } from "../../requestIngestion";

export function getKivoTools(state: any) {
  const tools: any[] = [];

  tools.push(
    tool(
      async () => {
        const [team] = await db.select().from(teams).where(eq(teams.id, state.teamId));
        return team ? JSON.stringify(team) : "Team not found.";
      },
      {
        name: "kivo_get_team",
        description: "Get the current team details, mission, and instructions.",
        schema: z.object({})
      }
    ),
    tool(
      async () => {
        const members = await db.select().from(agents).where(eq(agents.teamId, state.teamId));
        const sanitized = members.map(a => {
          const { llmApiKey, ...safeAgent } = a as any;
          if (safeAgent.metadata?.telegramBotToken) {
             delete safeAgent.metadata.telegramBotToken;
          }
          return safeAgent;
        });
        return JSON.stringify(sanitized);
      },
      {
        name: "kivo_list_team_members",
        description: "List all AI agents and members currently in your team, along with their roles and IDs.",
        schema: z.object({})
      }
    ),
    tool(
      async ({ status, targetAgentId }) => {
        let query = db.select().from(requests).where(eq(requests.teamId, state.teamId));
        
        const conditions = [eq(requests.teamId, state.teamId)];
        if (status) conditions.push(eq(requests.status, status as any));
        if (targetAgentId) conditions.push(eq(requests.targetAgentId, targetAgentId));
        
        const rows = await db.select().from(requests)
          .where(and(...conditions))
          .orderBy(desc(requests.createdAt))
          .limit(10);
          
        return JSON.stringify(rows);
      },
      {
        name: "kivo_list_requests",
        description: "List active work requests for the team or for a specific agent.",
        schema: z.object({
          status: z.enum(["draft", "open", "in_progress", "waiting_user", "success", "failed"]).optional().describe("Filter by request status."),
          targetAgentId: z.string().uuid().optional().describe("Filter by the assigned agent UUID.")
        })
      }
    ),
    tool(
      async ({ title, targetAgentId, requestDetails, priority }) => {
        const newRequest = await db.transaction(async (tx) => {
          const [team] = await tx.select({ identifierPrefix: teams.identifierPrefix }).from(teams).where(eq(teams.id, state.teamId));
          if (!team) throw new Error("Team not found");

          const nextNumResult = await tx.execute(sql`
            SELECT COALESCE(MAX(number), 0) + 1 as next_number FROM ${requests} WHERE team_id = ${state.teamId}
          `);
          const nextNumber = Number((nextNumResult.rows[0] as any).next_number);
          const identifier = `${team.identifierPrefix}-${nextNumber}`;

          const [req] = await tx.insert(requests).values({
            teamId: state.teamId,
            number: nextNumber,
            identifier,
            requesterAgentId: state.agentId,
            targetAgentId: targetAgentId || null,
            title: title,
            requestDetails: requestDetails || "",
            priority: priority || 2,
            status: "open"
          }).returning();
          return req;
        });
        
        // Trigger background ingestion to parse capability and create tasks
        runRequestIngestion(newRequest.id, state.teamId).catch(err => {
          console.error(`[kivoTools] Error running requestIngestion for req ${newRequest.id}:`, err);
        });
        
        return JSON.stringify(newRequest);
      },
      {
        name: "kivo_create_request",
        description: "Create a new work request for another agent in your team to execute.",
        schema: z.object({
          title: z.string().describe("A brief title or summary of the request."),
          targetAgentId: z.string().uuid().optional().describe("The UUID of the agent you want to assign this request to. Optional."),
          requestDetails: z.string().optional().describe("Detailed markdown instructions or context for the agent."),
          priority: z.number().int().min(0).max(4).optional().describe("Priority from 0 (highest) to 4 (lowest).")
        })
      }
    ),
    tool(
      async () => {
        const rows = await db.select({
          identifier: teamCapabilities.identifier,
          name: teamCapabilities.name,
          type: teamCapabilities.type,
          instructions: teamCapabilities.instructions,
          inputsDescription: teamCapabilities.inputsDescription
        })
        .from(teamCapabilities)
        .where(eq(teamCapabilities.teamId, state.teamId));
        
        return JSON.stringify(rows);
      },
      {
        name: "kivo_get_team_capabilities",
        description: "Get a list of all capabilities (skills/workflows) that the team is equipped to handle.",
        schema: z.object({})
      }
    )
  );

  return tools;
}
