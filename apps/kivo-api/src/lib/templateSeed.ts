import { db } from "../db/client";
import { agentRoles, teamTypes, teamTypeRoles } from "../db/schema";
import { eq } from "drizzle-orm";

const ADMIN_API_URL = process.env.ADMIN_API_INTERNAL_URL || "http://kivo-admin-api:4001";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

export async function runTemplateSeed() {
  if (!INTERNAL_TOKEN) {
    console.error("❌ [template-seed] INTERNAL_SERVICE_TOKEN not set. Sync skipped! Meta configuration (Team Types) will be missing.");
    return;
  }

  console.log(`🌱 Starting Template Seed (Sync from ${ADMIN_API_URL})...`);

  let retries = 5;
  let success = false;

  while (retries > 0 && !success) {
    try {
      // 1. Sync Agent Roles
      console.log("   -> Syncing Agent Roles...");
      const rolesRes = await fetch(`${ADMIN_API_URL}/internal/v1/templates/agent-roles/sync`, {
        headers: { "x-internal-token": INTERNAL_TOKEN }
      });
      
      if (!rolesRes.ok) throw new Error(`Failed to fetch roles: ${rolesRes.statusText}`);
      const rolesData = await rolesRes.json() as { data: any[] };
      const roles = rolesData.data;

      for (const role of roles) {
        await db.insert(agentRoles).values(role).onConflictDoUpdate({
          target: agentRoles.id,
          set: role
        });
      }

      // 2. Sync Team Types
      console.log("   -> Syncing Team Types...");
      const teamsRes = await fetch(`${ADMIN_API_URL}/internal/v1/templates/team-types/sync`, {
        headers: { "x-internal-token": INTERNAL_TOKEN }
      });

      if (!teamsRes.ok) throw new Error(`Failed to fetch team types: ${teamsRes.statusText}`);
      const teamsData = await teamsRes.json() as { data: any[] };
      const teamTypesList = teamsData.data;

      for (const type of teamTypesList) {
        const { roles, ...teamTypeData } = type;

        await db.insert(teamTypes).values(teamTypeData).onConflictDoUpdate({
          target: teamTypes.id,
          set: teamTypeData
        });

        // 3. Sync Team Type Roles (Composition)
        await db.delete(teamTypeRoles).where(eq(teamTypeRoles.teamTypeId, type.id));
        if (roles && Array.isArray(roles)) {
          for (const roleLink of roles) {
            await db.insert(teamTypeRoles).values({
              teamTypeId: type.id,
              agentRoleId: roleLink.roleId,
              quantity: roleLink.quantity,
              isLeader: roleLink.isLeader,
            });
          }
        }
      }

      console.log("✅ Template Seed complete!");
      success = true;
    } catch (err) {
      retries--;
      console.error(`❌ Template Seed attempt failed (${retries} retries left):`, err instanceof Error ? err.message : err);
      if (retries > 0) {
        await new Promise(res => setTimeout(res, 5000)); // Wait 5s before retry
      }
    }
  }
}
