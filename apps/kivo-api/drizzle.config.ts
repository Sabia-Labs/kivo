import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  migrationsTable: "__drizzle_migrations_kivo",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://kivo:kivo@localhost:5432/kivo",
  },
} satisfies Config;
