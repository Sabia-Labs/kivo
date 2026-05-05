/**
 * Kivo Admin API — Seed Script
 */

import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_ADMIN ?? "postgres://kivo:kivo@localhost:5432/kivo_admin",
});

const db = drizzle(pool, { schema });

async function main() {
  console.log("🌱 Seeding Kivo Admin API...\n");


  // ── 3. Seed User & Workspace ───────────────────────────────────────────────
  console.log("→ Seeding Demo User: Wei Chen");
  const [user] = await db
    .insert(schema.users)
    .values({
      email: "wei.chen@acme.dev",
      passwordHash: "$2b$12$R.SDR6YpBwG6Pq9.H6v8k.7G.L.v.N.v.O.v.P.v.Q.v.R.v.S.v.T", // placeholder
      isAdmin: true,
    })
    .onConflictDoNothing()
    .returning();

  if (user) {
    console.log(`  ✓ User created: ${user.id}`);
    const [workspace] = await db.insert(schema.workspaces).values({
      userId: user.id,
      name: "ACME",
      k8sNamespace: `kivo-ws-${user.id.substring(0, 8)}`,
    }).returning();
    console.log(`  ✓ Workspace created: ${workspace.id} (Namespace: ${workspace.k8sNamespace})`);
    
    console.log(`\n👉 To seed the application plane, run:`);
    console.log(`   make db-seed WORKSPACE_ID=${workspace.id}`);
  } else {
    console.log("  ↩ User already exists.");
  }

  console.log("\n✅ Admin seed complete!\n");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
