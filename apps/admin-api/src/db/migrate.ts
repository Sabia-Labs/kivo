import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./client";
import path from "path";

export async function runMigrations() {
  console.log("⏳ Running database migrations for Admin API...");
  try {
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), "migrations"),
    });
    console.log("✅ Migrations completed successfully.");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}
