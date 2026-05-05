import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { teamCapabilities } from "../db/schema";

export async function getCapabilitiesByTeam(teamId: string) {
  return await db.select().from(teamCapabilities).where(eq(teamCapabilities.teamId, teamId));
}

export async function getCapabilityByIdentifier(teamId: string, identifier: string) {
  const caps = await db.select().from(teamCapabilities).where(and(eq(teamCapabilities.teamId, teamId), eq(teamCapabilities.identifier, identifier)));
  return caps.length > 0 ? caps[0] : null;
}

export async function createCandidateCapability(
  teamId: string,
  name: string,
  identifier: string,
  instructions: string,
  type: "task_template" | "workflow",
  inputsDescription: string,
  expectedOutputsDescription: string,
  assignedRole: string
) {
  const [newCap] = await db.insert(teamCapabilities).values({
    teamId,
    name,
    identifier,
    instructions,
    isCandidate: true,
    type,
    inputsDescription,
    expectedOutputsDescription,
    assignedRole
  }).returning();
  
  return newCap;
}
