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
  console.log("🌱 Seeding Kivo Admin API...");
  console.log("  ✓ No static users to seed. Use Google Auth or API to create users.");
  console.log("\n✅ Admin seed complete!\n");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
