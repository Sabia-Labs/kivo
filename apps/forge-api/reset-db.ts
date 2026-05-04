import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://forge:forge@localhost:5432/forge" });

async function reset() {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;");
  console.log("Database reset.");
  process.exit(0);
}
reset();
