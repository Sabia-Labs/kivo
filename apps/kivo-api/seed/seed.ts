/**
 * Kivo API — Seed Script (Application Plane)
 *
 * NOTE: As of the new architecture, meta configuration (Team Types, Roles, Capabilities)
 * is automatically synchronized from the Admin API (Control Plane) during server startup.
 *
 * This script is now a placeholder for local development data only.
 */

import "dotenv/config";

async function main() {
  console.log("🌱 Kivo Application Plane Seed");
  console.log("ℹ️ Meta configuration is now synchronized automatically from Admin API on startup.");
  console.log("✅ Nothing to seed manually.");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
