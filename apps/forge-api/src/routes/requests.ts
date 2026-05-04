import { Router } from "express";
import { db } from "../db/client";
import { users, requests, tasks, agents, workspaces, teams, comments, conversations, messages, notifications } from "../db/schema";
import { eq, and, desc, or, sql, isNull } from "drizzle-orm";
import { authMiddleware } from "../middleware/authMiddleware";
import { z } from "zod";
import { logActivity } from "../lib/activity-logger";
import { assignAgentToRequest } from "../lib/agent-assignment";
import { publishToAgent, tenantVhost, tenantExchange } from "../lib/rabbitmq";
import { buildTeamRequestMessage, buildTeamRequestInstructions, buildTeamRequestFinishedMessage } from "../lib/messages";
import { completeRequest, handleRequestCompletedState, handleRequestCreatedState, updateRequest } from "../controllers/requestsController";
import { runFieldInsight } from "../workflows/fieldInsight";
import { randomBytes } from "crypto";

export const requestsRouter = Router({ mergeParams: true });

// Helper to determine if a string is a UUID
const isUuid = (str: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
const requestSchema = z.object({
  title: z.string(),
  targetAgentId: z.string().uuid().optional().nullable(),
  targetRole: z.string().optional().nullable(),
  requestDetails: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  capabilitiesWorkflow: z.any().optional(),
  state: z.array(z.string()).optional(),
  status: z.enum(["draft", "open", "in_progress", "waiting_user", "completed", "cancelled"]).optional(),
  resolution: z.enum(["success", "failed"]).optional().nullable(),
  response: z.string().optional(),
  parentRequestId: z.string().optional().nullable(),
});

// POST /teams/:teamId/requests
requestsRouter.post("/", authMiddleware, async (req, res) => {
  try {
    const teamId = String(req.params.teamId);
    const body = requestSchema.parse(req.body);

    const actorId = req.actor!.id;
    const actorType = req.actor!.type;

    const newRequest = await db.transaction(async (tx) => {
      const [team] = await tx.select({ identifierPrefix: teams.identifierPrefix }).from(teams).where(eq(teams.id, teamId));
      if (!team) {
        throw new Error("Team not found");
      }

      const nextNumResult = await tx.execute(sql`
        SELECT COALESCE(MAX(number), 0) + 1 as next_number FROM ${requests} WHERE team_id = ${teamId}
      `);
      const nextNumber = Number((nextNumResult.rows[0] as any).next_number);
      const identifier = `${team.identifierPrefix}-${nextNumber}`;

      let resolvedParentRequestId: string | undefined = undefined;
      if (body.parentRequestId) {
        if (isUuid(body.parentRequestId)) {
          resolvedParentRequestId = body.parentRequestId;
        } else {
          const [parentReq] = await tx.select({ id: requests.id }).from(requests).where(and(eq(requests.identifier, body.parentRequestId), eq(requests.teamId, teamId)));
          if (parentReq) {
            resolvedParentRequestId = parentReq.id;
          } else {
            throw new Error(`Parent request with identifier ${body.parentRequestId} not found.`);
          }
        }
      }

      const [reqRecord] = await tx
        .insert(requests)
        .values({
          teamId,
          number: nextNumber,
          identifier,
          title: body.title,
          requesterUserId: actorType === "human" ? actorId : undefined,
          requesterAgentId: actorType === "agent" ? actorId : undefined,
          targetAgentId: body.targetAgentId,
          targetRole: body.targetRole,
          
          requestDetails: body.requestDetails,
          capabilitiesWorkflow: body.capabilitiesWorkflow,
          state: body.state,
          status: body.status || "open",
          parentRequestId: resolvedParentRequestId,
        })
        .returning();

      return reqRecord;
    });

    if (newRequest.status !== "draft") {
      // Log request created only if it's not a draft
      await logActivity({
        teamId,
        actorId,
        actorType,
        changeType: "creation",
        activityTitle: `Created new request: ${newRequest.title}`,
        requestId: newRequest.id,
      });
    }
    
    if (newRequest.status === "open") {
      handleRequestCreatedState(newRequest).catch(console.error);
    }

    res.status(201).json({ data: newRequest });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Invalid input" });
  }
});

// GET /teams/:teamId/requests
requestsRouter.get("/", authMiddleware, async (req, res) => {
  try {
    const teamId = String(req.params.teamId);
    let statusFilter = req.query.status as string | undefined;
    let targetAgentIdFilter = req.query.targetAgentId as string | undefined;
    let parentRequestIdFilter = req.query.parentRequestId as string | undefined;

    const conditions: any[] = [eq(requests.teamId, teamId)];
    if (statusFilter) {
      conditions.push(eq(requests.status, statusFilter as "draft" | "open" | "in_progress" | "waiting_user" | "completed" | "cancelled"));
    }
    if (targetAgentIdFilter) {
      conditions.push(eq(requests.targetAgentId, targetAgentIdFilter));
    }
    if (parentRequestIdFilter !== undefined) {
      if (parentRequestIdFilter === "null") {
        conditions.push(isNull(requests.parentRequestId));
      } else if (!isUuid(parentRequestIdFilter)) {
        const [parentReq] = await db.select({ id: requests.id }).from(requests).where(and(eq(requests.identifier, parentRequestIdFilter), eq(requests.teamId, teamId)));
        if (parentReq) {
          conditions.push(eq(requests.parentRequestId, parentReq.id));
        } else {
          return res.json({ data: [] });
        }
      } else {
        conditions.push(eq(requests.parentRequestId, parentRequestIdFilter));
      }
    }

    const rows = await db.query.requests.findMany({
      where: and(...conditions),
      orderBy: (requests, { desc }) => [desc(requests.createdAt)],
    });

    res.json({ data: rows });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Invalid input" });
  }
});

// POST /teams/:teamId/requests/insight
requestsRouter.post("/insight", authMiddleware, async (req, res) => {
  try {
    const teamId = String(req.params.teamId);
    const { requestDetails, capabilitiesWorkflow } = req.body;

    if (!requestDetails) {
      return res.status(400).json({ error: "requestDetails is required" });
    }

    const capabilityIdentifier = capabilitiesWorkflow && capabilitiesWorkflow.length > 0 ? capabilitiesWorkflow[0] : undefined;

    const insightResult = await runFieldInsight(teamId, requestDetails, capabilityIdentifier);

    res.json({ data: insightResult });
  } catch (err: any) {
    console.error("[field-insight] Error:", err);
    res.status(500).json({ error: err.message || "Failed to generate field insight" });
  }
});

// GET /teams/:teamId/requests/:requestId
requestsRouter.get("/:requestId", authMiddleware, async (req, res) => {
  try {
    const teamId = String(req.params.teamId);
    const requestIdParam = String(req.params.requestId);
    const condition = isUuid(requestIdParam) ? eq(requests.id, requestIdParam) : eq(requests.identifier, requestIdParam);

    const [request] = await db
      .select()
      .from(requests)
      .where(and(condition, eq(requests.teamId, teamId)));

    if (!request) {
      return res.status(404).json({ error: "Request not found." });
    }

    res.json({ data: request });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Invalid input" });
  }
});

// GET /teams/:teamId/requests/:requestId/tasks
requestsRouter.get("/:requestId/tasks", authMiddleware, async (req, res) => {
  try {
    const teamId = String(req.params.teamId);
    const requestIdParam = String(req.params.requestId);
    const condition = isUuid(requestIdParam) ? eq(requests.id, requestIdParam) : eq(requests.identifier, requestIdParam);

    // We need to resolve the requestId first if it's an identifier
    const [request] = await db.select({ id: requests.id }).from(requests).where(and(condition, eq(requests.teamId, teamId)));
    
    if (!request) {
      return res.status(404).json({ error: "Request not found." });
    }

    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.teamId, teamId), eq(tasks.requestId, request.id)))
      .orderBy(desc(tasks.createdAt));

    if (request.id) {
      const [reqRec] = await db.select({ state: requests.state }).from(requests).where(eq(requests.id, request.id));
      if (reqRec && reqRec.state) {
        rows.forEach(r => {
          (r as any).context = reqRec.state;
        });
      }
    }

    res.json({ data: rows });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Invalid input" });
  }
});

// PATCH /teams/:teamId/requests/:requestId
requestsRouter.patch("/:requestId", authMiddleware, async (req, res) => {
  try {
    const teamId = String(req.params.teamId);
    const requestIdParam = String(req.params.requestId);
    const condition = isUuid(requestIdParam) ? eq(requests.id, requestIdParam) : eq(requests.identifier, requestIdParam);
    const body = requestSchema.partial().parse(req.body);
    
    const actorId = req.actor!.id;
    const actorType = req.actor!.type;

    if (!actorId) {
       return res.status(400).json({ error: "Actor ID is required for logging." });
    }

    // Fetch existing request to get its true UUID and ensure it belongs to team
    const [existing] = await db
      .select({ id: requests.id })
      .from(requests)
      .where(and(condition, eq(requests.teamId, teamId)));

    if (!existing) {
      return res.status(404).json({ error: "Request not found." });
    }

    const updatedRequest = await updateRequest(existing.id, body, actorId, actorType);

    res.json({ data: updatedRequest });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Invalid input" });
  }
});

// DELETE /teams/:teamId/requests/:requestId
requestsRouter.delete("/:requestId", authMiddleware, async (req, res) => {
  try {
    const teamId = String(req.params.teamId);
    const requestIdParam = String(req.params.requestId);
    const condition = isUuid(requestIdParam) ? eq(requests.id, requestIdParam) : eq(requests.identifier, requestIdParam);

    const [deleted] = await db
      .delete(requests)
      .where(and(condition, eq(requests.teamId, teamId)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Request not found." });
    }

    // Also delete any related notifications
    await db.delete(notifications).where(and(
      eq(notifications.teamId, teamId),
      eq(notifications.relatedEntityType, "request"),
      eq(notifications.relatedEntityId, deleted.id)
    ));

    res.json({ data: { success: true } });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to delete request" });
  }
});

// GET /teams/:teamId/requests/:requestId/comments
requestsRouter.get("/:requestId/comments", authMiddleware, async (req, res) => {
  try {
    const teamId = String(req.params.teamId);
    const requestIdParam = String(req.params.requestId);
    const condition = isUuid(requestIdParam) ? eq(requests.id, requestIdParam) : eq(requests.identifier, requestIdParam);

    const [request] = await db.select({ id: requests.id }).from(requests).where(and(condition, eq(requests.teamId, teamId)));
    if (!request) {
      return res.status(404).json({ error: "Request not found." });
    }

    const rows = await db
      .select()
      .from(comments)
      .where(and(eq(comments.teamId, teamId), eq(comments.requestId, request.id)))
      .orderBy(desc(comments.createdAt));

    res.json({ data: rows });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Invalid input" });
  }
});

// POST /teams/:teamId/requests/:requestId/comments
const commentSchema = z.object({
  content: z.string().min(1),
});

requestsRouter.post("/:requestId/comments", authMiddleware, async (req, res) => {
  try {
    const teamId = String(req.params.teamId);
    const requestIdParam = String(req.params.requestId);
    const condition = isUuid(requestIdParam) ? eq(requests.id, requestIdParam) : eq(requests.identifier, requestIdParam);
    const body = commentSchema.parse(req.body);

    const [request] = await db.select({ id: requests.id }).from(requests).where(and(condition, eq(requests.teamId, teamId)));
    if (!request) {
      return res.status(404).json({ error: "Request not found." });
    }

    const actorId = req.actor!.id;
    const actorType = req.actor!.type;

    const [newComment] = await db
      .insert(comments)
      .values({
        teamId,
        requestId: request.id,
        actorId,
        actorType,
        content: body.content,
      })
      .returning();

    res.status(201).json({ data: newComment });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Invalid input" });
  }
});
