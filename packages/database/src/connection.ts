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

// Local Postgres (brew) does not have SSL configured; remote
// providers (Supabase, etc.) require it. Detect by hostname.
function isLocalUrl(url: string): boolean {
  return /\/\/[^@]*@(localhost|127\.0\.0\.1)/.test(url);
}

// Singleton pattern: reuse the same connection pool across all calls
// to createDb() within the same process. This prevents "too many
// connections" errors in workers that process many jobs.
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function createDb() {
  if (cachedDb) return cachedDb;

  const url = getConnectionString();
  const client = postgres(url, {
    max: 5, // Max connections per worker process
    idle_timeout: 20, // Close idle connections after 20s
    max_lifetime: 60 * 10, // 10 min max connection lifetime
    ssl: isLocalUrl(url) ? false : "require",
  });
  cachedDb = drizzle(client, { schema });
  return cachedDb;
}

export type Db = ReturnType<typeof createDb>;
