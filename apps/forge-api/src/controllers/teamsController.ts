import { eq, and, ne } from "drizzle-orm";
import { db } from "../db/client";
import { teams } from "../db/schema";

export async function getTeamById(teamId: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  return team;
}

export async function getOtherTeamsInWorkspace(workspaceId: string, excludeTeamId: string) {
  return await db.select().from(teams).where(and(eq(teams.workspaceId, workspaceId), ne(teams.id, excludeTeamId)));
}
