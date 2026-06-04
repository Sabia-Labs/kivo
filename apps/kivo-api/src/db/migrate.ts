import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./client";
import { sql } from "drizzle-orm";
import path from "path";

export async function runMigrations() {
  console.log("⏳ Running database migrations for Kivo API...");
  try {
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), "migrations"),
    });
    console.log("✅ Migrations completed successfully.");

    // Ensure language column exists
    console.log("⏳ Ensuring language column exists on workspaces...");
    await db.execute(sql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en'`);
    console.log("✅ Language column check complete.");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}
