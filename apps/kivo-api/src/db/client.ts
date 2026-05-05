import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://kivo:kivo@localhost:5432/kivo",
});

/** Drizzle db client — import this everywhere you need DB access. */
export const db = drizzle(pool, { schema });
