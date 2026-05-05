import { db } from "../db/client";
import { agents, activities } from "../db/schema";
import { and, eq, desc } from "drizzle-orm";

export async function assignAgentToRequest(
  teamId: string,
  targetAgentId?: string | null,
  targetRole?: string | null
): Promise<string | null> {
  if (targetAgentId) {
    return targetAgentId;
  }

  let agentQuery = db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.teamId, teamId), eq(agents.availability, "available" as any)));

  const availableAgents = await agentQuery;
  
  let filteredAgents = availableAgents;
  if (targetRole) {
     const agentsWithRole = await db
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.teamId, teamId),
            eq(agents.type, targetRole),
            eq(agents.availability, "available" as any)
          )
        );
     if (agentsWithRole.length > 0) {
       filteredAgents = agentsWithRole;
     }
  }

  if (filteredAgents.length === 0) {
    // Fallback to any agent in the team if none available
    const anyAgent = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.teamId, teamId))
      .limit(1);
    
    if (anyAgent.length > 0) return anyAgent[0].id;
  } else if (filteredAgents.length === 1) {
    return filteredAgents[0].id;
  } else {
    // Find the one least recently active
    const agentIds = filteredAgents.map(a => a.id);
    const recentActivities = await db
      .select({ actorId: activities.actorId, maxDate: activities.createdAt })
      .from(activities)
      .where(eq(activities.teamId, teamId))
      .orderBy(desc(activities.createdAt));
      
    const activeAgentIds = recentActivities.map(a => a.actorId);
    let selected = agentIds[0];
    
    for (const id of agentIds) {
      if (!activeAgentIds.includes(id)) {
        return id; // Has no activities, pick it!
      }
    }
    
    // If all have activities, pick the one that appears last in activeAgentIds
    const reversed = [...activeAgentIds].reverse();
    for (const id of reversed) {
      if (agentIds.includes(id)) {
        return id;
      }
    }
    
    return selected;
  }

  return null;
}
