import "dotenv/config";
import { db } from "../src/db/client";
import { sql } from "drizzle-orm";

async function main() {
  const caps = await db.execute(sql`
    SELECT id, title, prompt, instructions, status, failure_reason, result
    FROM tasks
    ORDER BY created_at DESC
    LIMIT 3
  `);

  console.log(JSON.stringify(caps.rows, null, 2));
  process.exit(0);
}
main();
