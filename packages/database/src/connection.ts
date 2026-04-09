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

export function createDb() {
  const client = postgres(getConnectionString());
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
