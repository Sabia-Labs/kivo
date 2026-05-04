import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { agents, workspaces, teams, users } from "../db/schema";
import { success, failure } from "../lib/response";
import { applyRabbitMQCredentialsSecret, rolloutRestartDeployment, ensureNamespace } from "../k8s/provisioner";
import { provisionTenant } from "../lib/rabbitmq";
import { teamCapabilities, tasks, requests, conversations, messages, activities } from "../db/schema";
import { createTaskInternal } from "./tasks";
import { randomBytes } from "crypto";
import { publishToAgent, getAdminCredentialsForWorkspace } from "../lib/rabbitmq";
import { desc, and, sql } from "drizzle-orm";
import { assignAgentToRequest } from "../lib/agent-assignment";
import { buildTeamRequestMessage } from "../lib/messages";
/**
 * Internal routes — NOT exposed via the external Ingress.
 * Protected by NetworkPolicy: only the Agent Controller pod can reach these.
 *
 * Mount point: /internal
 */
export const internalRouter = Router();

/**
 * POST /internal/provision-workspace
 *
 * Sincroniza um novo usuário e workspace criado pelo Admin API (Control Plane)
 * para este banco de dados local (Application Plane).
 *
 * Body: { userId, userEmail, userName, workspaceId, workspaceName }
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
            k8sNamespace: `forge-ws-${workspaceId.substring(0, 8)}`,
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
 * PATCH /internal/agents/:id/k8s-status
 *
 * Called by the Agent Controller when a ForgeAgent CR's reconciliation
 * phase changes. Keeps the postgres record in sync with cluster state.
 *
 * Body: { phase: "provisioning" | "running" | "failed" | "terminated" }
 */
internalRouter.patch(
  "/agents/:id/k8s-status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { phase } = req.body as { phase: string };

      const validPhases = ["pending", "provisioning", "running", "failed", "terminated"];
      if (!validPhases.includes(phase)) {
        res.status(400).json(failure(`Invalid phase: ${phase}. Expected one of: ${validPhases.join(", ")}`));
        return;
      }

      const [updated] = await db
        .update(agents)
        .set({ k8sStatus: phase as any, updatedAt: new Date() })
        .where(eq(agents.id, String(id)))
        .returning({ id: agents.id, k8sStatus: agents.k8sStatus });

      if (!updated) {
        res.status(404).json(failure("Agent not found"));
        return;
      }

      res.json(success({ id: updated.id, k8sStatus: updated.k8sStatus }));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /internal/workspaces/:id/reprovision-rabbit
 *
 * Idempotent endpoint to (re-)provision the RabbitMQ tenant for a workspace.
 *
 * Use case: called automatically at startup (see below) or manually when
 * RabbitMQ was not ready at workspace creation time (e.g. after `tilt down && tilt up`).
 *
 * Steps:
 *  1. Provisions vhost / user / exchange in RabbitMQ (idempotent).
 *  2. Upserts the `rabbitmq-credentials` Secret in the workspace namespace.
 *  3. Rolling-restarts all agent Deployments in the namespace so pods pick up the new env vars.
 *
 * Returns: { workspaceId, namespace, agentsRestarted: number }
 */
internalRouter.post(
  "/workspaces/:id/reprovision-rabbit",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = String(req.params.id);

      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId));

      if (!workspace) {
        res.status(404).json(failure("Workspace not found"));
        return;
      }

      if (!workspace.k8sNamespace) {
        res.status(400).json(failure("Workspace has no Kubernetes namespace — not yet provisioned"));
        return;
      }

      // 0. Ensure namespace exists (in case it was deleted or never created)
      await ensureNamespace(workspace.k8sNamespace);

      // 1. Provision (or re-provision) the RabbitMQ tenant
      const creds = await provisionTenant(workspaceId);
      console.log(`[internal] RabbitMQ tenant (re-)provisioned for workspace ${workspaceId}`);

      // 2. Upsert the rabbitmq-credentials Secret in the workspace namespace
      await applyRabbitMQCredentialsSecret(workspace.k8sNamespace, creds);
      console.log(`[internal] rabbitmq-credentials Secret upserted in ${workspace.k8sNamespace}`);

      // 3. Rolling-restart all agents in the workspace so they pick up the new creds
      const workspaceAgents = await db
        .select({ id: agents.id })
        .from(agents)
        .innerJoin(teams, eq(teams.id, agents.teamId))
        .where(eq(teams.workspaceId, workspaceId));

      let agentsRestarted = 0;
      for (const agent of workspaceAgents) {
        try {
          await rolloutRestartDeployment(workspace.k8sNamespace, agent.id);
          agentsRestarted++;
        } catch (err) {
          // Non-fatal: agent may not be deployed yet
          console.warn(`[internal] rollout restart failed for agent ${agent.id} (skipped):`, err);
        }
      }

      console.log(`[internal] Rolling-restarted ${agentsRestarted} agents in ${workspace.k8sNamespace}`);

      res.json(success({
        workspaceId,
        namespace: workspace.k8sNamespace,
        agentsRestarted,
      }));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /internal/startup/reprovision-all-rabbit
 *
 * Startup safety net — called by the API process itself on boot (see index.ts).
 * Re-provisions RabbitMQ tenants for every workspace that already has a K8s namespace
 * but whose tenant may have been lost (e.g. after `tilt down && tilt up`).
 *
 * Idempotent and non-fatal: errors per workspace are logged but do not abort the loop.
 * Does NOT restart pods — the caller (startup hook) handles that if needed.
 *
 * Returns a summary of what was (re-)provisioned.
 */
internalRouter.post(
  "/startup/reprovision-all-rabbit",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allWorkspaces = await db
        .select()
        .from(workspaces);

      const results: Array<{ workspaceId: string; status: string; error?: string }> = [];

      for (const ws of allWorkspaces) {
        if (!ws.k8sNamespace) continue;
        try {
          const creds = await provisionTenant(ws.id);
          await applyRabbitMQCredentialsSecret(ws.k8sNamespace, creds);
          results.push({ workspaceId: ws.id, status: "ok" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[internal/startup] RabbitMQ reprovision failed for workspace ${ws.id}:`, msg);
          results.push({ workspaceId: ws.id, status: "error", error: msg });
        }
      }

      res.json(success({ reprovisioned: results }));
    } catch (err) {
      next(err);
    }
  },
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

      // 3. Create NEW Conversation
      const [conversation] = await db.insert(conversations).values({
        agentId: targetAgentId,
        counterpartType: "external" as any,
        counterpartId: "system",
        counterpartName: "System Orchestrator"
      }).returning();

      // 4. Create Message
      const messageContent = buildTeamRequestMessage(requestRecord);

      const [userMessage] = await db.insert(messages).values({
        conversationId: conversation.id,
        role: "user" as any,
        content: messageContent
      }).returning();

      // 6. Publish to Agent
      const [agent] = await db.select().from(agents).where(eq(agents.id, targetAgentId));
      if (agent) {
         const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId));
         const [workspace] = team ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId)) : [];
         
         if (workspace) {
           const rabbitCreds = getAdminCredentialsForWorkspace(workspace.id);
            
            try {
              await publishToAgent(rabbitCreds, {
                tenantId:   workspace.id,
                agentId:    agent.id,
                sessionKey: conversation.id,
                messageId:  randomBytes(16).toString("hex"),
                action:     "chat_message",
                payload:    { role: "user", content: messageContent },
              });
            } catch (err) {
              console.error("[internal] RabbitMQ publish failed for trigger:", err);
            }
         }
      }

      res.status(200).json(success({ request: requestRecord, conversation }));
    } catch (err) {
      next(err);
    }
  }
);

