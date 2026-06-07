import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { agents, workspaces, teams, users, agentRoles } from "../db/schema";
import { success, failure } from "../lib/response";
import { rolloutRestartDeployment, ensureNamespace, workspaceNamespace, deliverMessageToAgent } from "../k8s/provisioner";
import { teamCapabilities, tasks, requests, conversations, messages, activities } from "../db/schema";
import { createTaskInternal } from "./tasks";
import { randomBytes } from "crypto";
import { desc, and, sql } from "drizzle-orm";
import { assignAgentToRequest } from "../lib/agent-assignment";
import { buildTeamRequestMessage, replacePlaceholders } from "../lib/messages";
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
            k8sNamespace: process.env.KIVO_SHARED_NAMESPACE || `kivo-ws-${workspaceId.substring(0, 8)}`,
            langchain: process.env.FEATURE_FLAG_LANGCHAIN === "true",
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
 * GET /internal/v1/agents/:id/bootstrap-data
 * 
 * Retorna os arquivos iniciais para o PVC do agente (IDENTITY, SOUL, etc).
 * Chamado pelo bootstrap.sh no primeiro boot do Pod.
 */
internalRouter.get(
  "/v1/agents/:id/bootstrap-data",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      console.log(`[internal] Bootstrap data requested for agent ${id}`);

      const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, String(id)))
        .limit(1);

      if (!agent) {
        console.warn(`[internal] Bootstrap failed: Agent ${id} not found`);
        res.status(404).json(failure("Agent not found"));
        return;
      }

      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, agent.teamId))
        .limit(1);

      if (!team) {
        console.warn(`[internal] Bootstrap failed: Team ${agent.teamId} not found for agent ${id}`);
        res.status(404).json(failure("Team not found"));
        return;
      }

      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, team.workspaceId))
        .limit(1);

      const [user] = workspace 
        ? await db.select().from(users).where(eq(users.id, workspace.userId)).limit(1)
        : [null];

      // Busca o template original da role
      const [role] = agent.roleId 
        ? await db.select().from(agentRoles).where(eq(agentRoles.id, agent.roleId)).limit(1)
        : [null];

      if (!role) {
        console.warn(`[internal] Bootstrap failed: Role template ${agent.roleId} not found for agent ${id}`);
        res.status(404).json(failure("Role template not found"));
        return;
      }

      console.log(`[internal] Successfully generated bootstrap files for agent ${agent.name} (${id})`);

      const placeholderVars = {
        agent_name: agent.name,
        team_name: team.name,
        team_id: team.id,
        operator_name: user?.name || "Operator",
        mission: team.mission || "",
      };

      // Monta o mapa de arquivos para o OpenClaw (lendo das colunas do banco)
      const files: Record<string, string> = {
        "IDENTITY.md": replacePlaceholders(role.identity, placeholderVars),
        "SOUL.md": replacePlaceholders(role.soul, placeholderVars),
        "AGENTS.md": replacePlaceholders(
          `${role.agentsBase}\n\n# OPERATING INSTRUCTIONS\n\n${role.operatingInstructions}`, 
          placeholderVars
        ),
        "USER.md": replacePlaceholders(role.userContext, placeholderVars),
        "MEMORY.md": replacePlaceholders(role.memory, placeholderVars),
        "TOOLS.md": replacePlaceholders(role.toolsNotes, placeholderVars),
        "HEARTBEAT.md": replacePlaceholders(role.heartbeat, placeholderVars),
      };

      res.json(success({ 
        agentId: agent.id,
        roleId: agent.roleId,
        files 
      }));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /internal/agents/:id/k8s-status
 *
 * Called by the Agent Controller when a KivoAgent CR's reconciliation
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

      // 5. Push to Agent Sidecar
      const [agent] = await db.select().from(agents).where(eq(agents.id, targetAgentId));
      if (agent) {
          const [team] = await db.select().from(teams).where(eq(teams.id, agent.teamId));
          const [workspace] = team ? await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId)) : [];
          if (workspace) {
            const namespace = workspace.k8sNamespace || workspaceNamespace(workspace.id);
            
            try {
              const delivered = await deliverMessageToAgent(namespace, agent.id, {
                sessionKey: conversation.id,
                content: messageContent,
                messageId: userMessage.id,
              });

              if (delivered) {
                await db.update(messages).set({ deliveredAt: new Date() }).where(eq(messages.id, userMessage.id));
              }
            } catch (err) {
              console.error("[internal] HTTP push failed for trigger:", err);
            }
         }
      }

      res.status(200).json(success({ request: requestRecord, conversation }));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /internal/v1/agents/:agentId/messages
 * 
 * Receives a message from an agent sidecar (consumer) and saves it to the database.
 * Used for agent replies or agent-to-agent communication.
 */
internalRouter.post(
  "/v1/agents/:agentId/messages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { agentId } = req.params;
      const { sessionKey, content, role } = req.body;

      if (!sessionKey || !content) {
        res.status(400).json(failure("sessionKey and content are required"));
        return;
      }

      // OpenClaw often prefixes session keys with 'dm:' or other channel identifiers.
      // We must strip these to get the clean UUID conversation ID.
      const cleanSessionKey = String(sessionKey).replace(/^(dm|group):/, "");

      // 1. Find the conversation
      let [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, cleanSessionKey))
        .limit(1);

      if (!conversation) {
        // If it's a new conversation initiated by the agent (rare, but possible)
        const [agent] = await db.select().from(agents).where(eq(agents.id, String(agentId))).limit(1);
        if (!agent) return res.status(404).json(failure("Agent not found"));

        [conversation] = await db.insert(conversations).values({
          id: cleanSessionKey,
          agentId: String(agentId),
          counterpartType: "human", // Correct enum value
          counterpartName: "User",
        } as any).returning();
      }

      // 2. Insert the message
      const [msg] = await db.insert(messages).values({
        conversationId: conversation.id,
        role: role || "assistant",
        content,
        deliveredAt: new Date(), // It's coming FROM the agent, so it's delivered
      }).returning();

      res.status(201).json(success(msg));
    } catch (err) {
      next(err);
    }
  }
);

