import { db } from "./src/db/client";
import { workspaces } from "./src/db/schema";
async function run() {
  const ws = await db.select().from(workspaces);
  console.log(JSON.stringify(ws, null, 2));
  process.exit(0);
}
run();
