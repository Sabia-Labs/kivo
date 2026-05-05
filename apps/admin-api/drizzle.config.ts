import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_ADMIN ?? "postgres://kivo:kivo@localhost:5432/kivo_admin",
  },
} satisfies Config;
