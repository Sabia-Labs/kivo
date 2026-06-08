import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "../db/client";
import { agents, workspaces, teams, users, agentRoles, teamCapabilities, tasks, requests, conversations, messages, activities } from "../db/schema";
import { success, failure } from "../lib/response";
import { assignAgentToRequest } from "../lib/agent-assignment";
import { buildTeamRequestMessage } from "../lib/messages";
import { runRequestIngestion } from "../workflows/requestIngestion";

export const internalRouter = Router();

/**
 * POST /internal/provision-workspace
 *
 * Sincroniza um novo usuário e workspace criado pelo Admin API (Control Plane)
 * para este banco de dados local (Application Plane).
 */
internalRouter.post(
  "/provision-workspace",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, userEmail, userName, workspaceId, workspaceName } = req.body;

      if (!userId || !workspaceId) {
        res.status(400).json(failure("userId and workspaceId are required"));
        return;
      }

      await db.transaction(async (tx) => {
        // 1. Ensure User exists
        await tx
          .insert(users)
          .values({
            id: userId,
            email: userEmail || `${userId}@placeholder.dev`,
            name: userName || "User",
          })
          .onConflictDoNothing();

        // 2. Ensure Workspace exists
        await tx
          .insert(workspaces)
          .values({
            id: workspaceId,
            userId,
            name: workspaceName || "Default Workspace",
            k8sNamespace: process.env.KIVO_SHARED_NAMESPACE || `kivo-ws-${workspaceId.substring(0, 8)}`,
          langchain: true,
          })
          .onConflictDoNothing();
      });

      res.status(201).json(success({ userId, workspaceId }));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /internal/capabilities/:id/trigger
 * 
 * Triggered by Kubernetes CronJob to execute a team capability.
 */
internalRouter.post(
  "/capabilities/:id/trigger",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const capabilityId = String(req.params.id);

      const [capability] = await db
        .select()
        .from(teamCapabilities)
        .where(eq(teamCapabilities.id, capabilityId));

      if (!capability || !capability.isEnabled) {
        res.status(400).json(failure("Capability not found or disabled"));
        return;
      }

      // 1. Select Agent
      const targetAgentId = await assignAgentToRequest(capability.teamId, capability.assignedAgentId, capability.assignedRole);

      if (!targetAgentId) {
        res.status(400).json(failure("No agent available to assign task"));
        return;
      }

      const SYSTEM_ACTOR = { id: "00000000-0000-0000-0000-000000000000", type: "human" as const };

      // 2. Create Team Request
      const requestDetails = `${capability.instructions}\n\n**Inputs to consider:**\n${capability.inputsDescription || 'None'}\n\n**Expected Outputs:**\n${capability.expectedOutputsDescription || 'None'}`;
      
      const requestRecord = await db.transaction(async (tx) => {
        const [team] = await tx.select({ identifierPrefix: teams.identifierPrefix }).from(teams).where(eq(teams.id, capability.teamId));
        if (!team) throw new Error("Team not found");

        const nextNumResult = await tx.execute(sql`
          SELECT COALESCE(MAX(number), 0) + 1 as next_number FROM ${requests} WHERE team_id = ${capability.teamId}
        `);
        const nextNumber = Number((nextNumResult.rows[0] as any).next_number);
        const identifier = `${team.identifierPrefix}-${nextNumber}`;

        const [req] = await tx.insert(requests).values({
          teamId: capability.teamId,
          number: nextNumber,
          identifier,
          requesterUserId: SYSTEM_ACTOR.id,
          targetAgentId: capability.assignedAgentId,
          targetRole: capability.assignedRole,
          title: `Capability Execution: ${capability.name}`,
          requestDetails: requestDetails,
          status: "open" as any
        }).returning();

        return req;
      });



      // 5. Trigger Request Ingestion Workflow
      console.log(`[internal] Triggering request ingestion for scheduled capability ${capability.name}`);
      runRequestIngestion(requestRecord.id, capability.teamId).catch(console.error);

      res.status(200).json(success({ request: requestRecord }));
    } catch (err) {
      next(err);
    }
  }
);
