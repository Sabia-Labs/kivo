import { eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db/client";
import { requests, notifications, conversations, messages, agents, teams, workspaces, comments } from "../db/schema";
import { buildTeamRequestFinishedMessage } from "../lib/messages";

import { logActivity } from "../lib/activity-logger";
import { runRequestIngestion } from "../workflows/requestIngestion";
import { t, resolveWorkspaceLanguage } from "../lib/i18n";

/**
 * Allocates the next sequential request number for a given team.
 * Uses MAX(number)+1 to stay consistent with the HTTP route pattern.
 */
export async function getNextRequestNumber(teamId: string): Promise<number> {
  const result = await db.execute(
    sql`SELECT COALESCE(MAX(number), 0) + 1 AS next_number FROM ${requests} WHERE team_id = ${teamId}`
  );
  return Number((result.rows[0] as any).next_number);
}

/**
 * Returns the team identifier prefix (e.g. "CS" for "CS-1").
 */
export async function getTeamIdentifierPrefix(teamId: string): Promise<string> {
  const [team] = await db.select({ identifierPrefix: teams.identifierPrefix }).from(teams).where(eq(teams.id, teamId));
  return team?.identifierPrefix ?? "REQ";
}

export async function handleRequestCreatedState(requestRecord: any) {
  try {
    // Start the LangGraph request ingestion workflow
    // It will handle classification, capability matching, task creation, and messaging the agent
    await runRequestIngestion(requestRecord.id, requestRecord.teamId);
  } catch (err) {
    console.error(`[request-ingestion] workflow failed for request ${requestRecord.id}:`, err);
    
    // Fail the request so the user is informed
    await db.update(requests).set({
      status: "failed",
      response: "An unexpected error occurred during request analysis and it could not be processed. Please check the logs."
    }).where(eq(requests.id, requestRecord.id));
  }
}

export async function handleRequestCompletedState(requestRecord: any) {
  // 1. If human requester, insert a notification
  if (requestRecord.requesterUserId) {
    const lang = await resolveWorkspaceLanguage(requestRecord.teamId);
    await db.insert(notifications).values({
      teamId: requestRecord.teamId,
      recipientId: requestRecord.requesterUserId,
      recipientType: "human",
      title: requestRecord.status === "failed" 
        ? t("requestFailed", lang) 
        : t("requestCompleted", lang),
      content: t("requestCompletedContent", lang, {
        identifier: requestRecord.identifier,
        status: requestRecord.status
      }),
      priority: requestRecord.status === "failed" ? "alert" : requestRecord.priority > 2 ? "high" : "normal",
      relatedEntityId: requestRecord.id,
      relatedEntityType: "request"
    });
  } 
  // 2. If agent requester, dispatch a message to the agent
  else if (requestRecord.requesterAgentId) {
    const targetAgentId = requestRecord.requesterAgentId;
    
    // Create NEW Conversation with the orchestrator
    const [conversation] = await db.insert(conversations).values({
      agentId: targetAgentId,
      counterpartType: "external" as any,
      counterpartId: "system",
      counterpartName: "System Orchestrator"
    }).returning();

    // Create Message
    const messageContent = buildTeamRequestFinishedMessage({
      identifier: requestRecord.identifier,
      title: requestRecord.title,
      status: requestRecord.status,
      response: requestRecord.response
    });

    const [userMessage] = await db.insert(messages).values({
      conversationId: conversation.id,
      role: "user" as any,
      content: messageContent
    }).returning();


  }
}

export async function completeRequest(requestId: string, status: "success" | "failed", response: string) {
  await updateRequest(requestId, {
    status,
    response
  });
}

export async function updateRequest(
  requestId: string, 
  updates: Partial<typeof requests.$inferInsert>, 
  actorId?: string, 
  actorType?: "human" | "agent"
) {
  const [existing] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!existing) return null;

  // Validation: prevent updating core fields if not in draft
  if (existing.status !== "draft" && updates.status !== undefined && updates.status !== "draft") {
    if (updates.requestDetails !== undefined || updates.capabilitiesWorkflow !== undefined || updates.state !== undefined) {
      delete updates.requestDetails;
      delete updates.capabilitiesWorkflow;
      delete updates.state;
    }
  }

  const [updatedRequest] = await db
    .update(requests)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(requests.id, requestId))
    .returning();

  if (updatedRequest) {
    const teamId = updatedRequest.teamId;
    const finalActorId = actorId || teamId;
    const finalActorType = actorType || "agent";

    let isStatusChangeHandled = false;

    if (existing.status === "draft" && updatedRequest.status === "open") {
      await logActivity({ teamId, actorId: finalActorId, actorType: finalActorType, changeType: "status", activityTitle: "Request opened", requestId: updatedRequest.id });
      handleRequestCreatedState(updatedRequest).catch(console.error);
      isStatusChangeHandled = true;
    } else if (
      existing.status !== "success" &&
      existing.status !== "failed" &&
      updatedRequest.status === "open" && 
      (updates.targetAgentId !== undefined && updates.targetAgentId !== existing.targetAgentId || 
       updates.targetRole !== undefined && updates.targetRole !== existing.targetRole)
    ) {
      await logActivity({ teamId, actorId: finalActorId, actorType: finalActorType, changeType: "status", activityTitle: "Request reassigned and retried", requestId: updatedRequest.id });
      handleRequestCreatedState(updatedRequest).catch(console.error);
      isStatusChangeHandled = true;
    } else if (updates.status === "in_progress" && existing.status !== "in_progress") {
      await logActivity({ teamId, actorId: finalActorId, actorType: finalActorType, changeType: "status", activityTitle: "Request in progress", requestId: updatedRequest.id });
      isStatusChangeHandled = true;
    } else if ((updates.status === "success" || updates.status === "failed") && (existing.status !== "success" && existing.status !== "failed")) {
      const activityTitle = updates.status === "success" ? "Request completed successfully" : "Request failed";
      await logActivity({ teamId, actorId: finalActorId, actorType: finalActorType, changeType: "status", activityTitle, requestId: updatedRequest.id });
      await handleRequestCompletedState(updatedRequest);
      isStatusChangeHandled = true;
    }

    if (!isStatusChangeHandled) {
      await logActivity({
        teamId,
        requestId: updatedRequest.id,
        actorId: finalActorId,
        actorType: finalActorType,
        changeType: "data",
        oldState: existing,
        newState: updatedRequest,
        activityTitle: `Request updated`
      });
    }
  }

  return updatedRequest;
}

export async function requireMoreInfoFromUser(
  requestId: string,
  teamId: string,
  requesterUserId: string | null | undefined,
  requestIdentifier: string,
  missingInfoDetails: string
) {
  await updateRequest(requestId, { status: "waiting_user" }, requesterUserId || teamId, requesterUserId ? "human" : "agent");
  
  // Add comment
  await db.insert(comments).values({
    teamId,
    requestId,
    actorId: requesterUserId || teamId, // Fallback actor
    actorType: "agent",
    content: `We need more information to proceed:\n\n${missingInfoDetails}`
  });

  // Notify user
  if (requesterUserId) {
    await db.insert(notifications).values({
      teamId,
      recipientId: requesterUserId,
      recipientType: "human",
      title: "Information Required for Request",
      content: `Request ${requestIdentifier} needs more information: ${missingInfoDetails}`,
      priority: "high",
      relatedEntityId: requestId,
      relatedEntityType: "request"
    });
  }
}

export async function addCommentToRequest(
  requestId: string,
  teamId: string,
  actorId: string,
  actorType: "human" | "agent",
  content: string
) {
  await db.insert(comments).values({
    teamId,
    requestId,
    actorId,
    actorType,
    content
  });
}
