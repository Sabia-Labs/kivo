import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  migrationsTable: "__drizzle_migrations_admin",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_ADMIN ?? "postgres://kivo:kivo@localhost:5432/kivo_admin",
  },
} satisfies Config;
