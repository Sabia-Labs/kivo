import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { agents } from "../db/schema";

export async function getAgentsByTeam(teamId: string) {
  return await db.select().from(agents).where(eq(agents.teamId, teamId)).orderBy(agents.createdAt);
}

export async function getAgentById(agentId: string) {
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  return agent;
}
