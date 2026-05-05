import "dotenv/config";
import { db } from "./client";
import { agents } from "./schema";

async function main() {
  const allAgents = await db.select({ id: agents.id, name: agents.name, token: agents.gatewayToken, teamId: agents.teamId }).from(agents);
  console.log(JSON.stringify(allAgents, null, 2));
  process.exit(0);
}

main().catch(console.error);
