import { eq } from "drizzle-orm";
import { db } from "./src/db/client";
import { teamTypeCapabilities, capabilities } from "./src/db/schema";

async function run() {
  const res = await db.select().from(teamTypeCapabilities)
    .innerJoin(capabilities, eq(capabilities.id, teamTypeCapabilities.capabilityId))
    .where(eq(teamTypeCapabilities.teamTypeId, "some-id"));
  console.log(res);
}
