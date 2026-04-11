import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

function getConnectionString(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return url;
}

// Singleton pattern: reuse the same connection pool across all calls
// to createDb() within the same process. This prevents "too many
// connections" errors in workers that process many jobs.
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function createDb() {
  if (cachedDb) return cachedDb;

  const client = postgres(getConnectionString(), {
    max: 5, // Max connections per worker process
    idle_timeout: 20, // Close idle connections after 20s
    max_lifetime: 60 * 10, // 10 min max connection lifetime
  });
  cachedDb = drizzle(client, { schema });
  return cachedDb;
}

export type Db = ReturnType<typeof createDb>;
