import { createDb } from "@mpgenesis/database";

// Singleton DB connection for the Next.js app
let db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!db) {
    db = createDb();
  }
  return db;
}
