import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_ADMIN ?? "postgres://kivo:kivo@localhost:5432/kivo_admin",
});

export const db = drizzle(pool, { schema });
