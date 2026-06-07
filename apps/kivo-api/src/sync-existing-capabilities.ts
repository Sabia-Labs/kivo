import "dotenv/config";
import { db } from "./db/client";
import { teams, teamCapabilities } from "./db/schema";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";
import * as path from "path";

// Load workspace root .env
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const ADMIN_API_URL = process.env.ADMIN_API_INTERNAL_URL || "http://localhost:4001";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

async function sync() {
  if (!INTERNAL_TOKEN) {
    console.error("❌ INTERNAL_SERVICE_TOKEN is not defined in the environment.");
    process.exit(1);
  }

  console.log(`Syncing capabilities from Control Plane (${ADMIN_API_URL})...`);
  
  const allTeams = await db.select().from(teams);
  console.log(`Found ${allTeams.length} existing teams.`);

  for (const team of allTeams) {
    if (!team.templateId) {
      console.log(`⚠️ Team "${team.name}" has no templateId. Skipping.`);
      continue;
    }

    console.log(`Syncing capabilities for team "${team.name}" (Type: ${team.templateId})...`);
    
    try {
      const url = `${ADMIN_API_URL}/internal/v1/templates/capabilities/sync?teamTypeId=${team.templateId}`;
      const capRes = await fetch(url, {
        headers: { "x-internal-token": INTERNAL_TOKEN }
      });
      
      if (!capRes.ok) {
        throw new Error(`Failed to fetch: ${capRes.statusText}`);
      }

      const capData = await capRes.json() as { data: any[] };
      const templateCaps = capData.data;
      
      console.log(`Fetched ${templateCaps.length} capabilities from Admin API.`);
      
      for (const tc of templateCaps) {
        const capabilityVal = {
          teamId: team.id,
          name: tc.capability.name,
          identifier: tc.capability.id,
          instructions: tc.capability.instructions,
          inputsDescription: tc.capability.inputsDescription,
          expectedOutputsDescription: tc.capability.expectedOutputsDescription,
          tasksWorkflow: tc.capability.tasksWorkflow,
          type: tc.capability.type,
          isFavorite: tc.isFavorite,
          assignedRole: tc.defaultAssignedRole,
        };

        // Upsert by deleting existing and inserting
        await db.delete(teamCapabilities)
          .where(
            eq(teamCapabilities.teamId, team.id) &&
            eq(teamCapabilities.identifier, tc.capability.id)
          );

        await db.insert(teamCapabilities).values(capabilityVal);
      }
      
      console.log(`✅ Successfully updated capabilities for team "${team.name}".`);
    } catch (err: any) {
      console.error(`❌ Failed to sync capabilities for team "${team.name}":`, err.message);
    }
  }

  console.log("🏁 Sync completed!");
  process.exit(0);
}

sync().catch(err => {
  console.error("❌ Synchronization failed:", err);
  process.exit(1);
});
