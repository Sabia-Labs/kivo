import { db } from "./src/db/client";
import { tasks, requests, teamCapabilities } from "./src/db/schema";
import { eq, desc } from "drizzle-orm";

async function run() {
  const taskId = "205c4317-bb5b-4356-a4ea-1070dff56566";
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return console.log("Task not found");
  
  console.log("Foreach Task:");
  console.log(task);
  
  const previousTasks = await db.select().from(tasks).where(eq(tasks.requestId, task.requestId!)).orderBy(desc(tasks.createdAt));
  console.log("\nAll Tasks in Request:");
  for (const pt of previousTasks) {
    console.log(`- ${pt.id}: ${pt.title} | status: ${pt.status}`);
    console.log(`  structuredState: ${JSON.stringify(pt.structuredState)}`);
    console.log(`  result: ${pt.result}`);
  }
  
  const request = await db.select().from(requests).where(eq(requests.id, task.requestId!));
  console.log("\nRequest capabilitiesWorkflow:", request[0].capabilitiesWorkflow);
  
  console.log("Capabilities:");
  const caps = await db.select().from(teamCapabilities).where(eq(teamCapabilities.type, "foreach"));
  for (const c of caps) {
    console.log(`Cap ${c.identifier}: loopOver=${c.loopOver}, loopItem=${c.loopItem}`);
  }

  process.exit(0);
}

run();
