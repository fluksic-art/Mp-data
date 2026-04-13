#!/usr/bin/env node
import { createDb, properties } from "@mpgenesis/database";
import { count, eq } from "drizzle-orm";

async function main() {
  const db = createDb();
  const [total] = await db.select({ value: count() }).from(properties);
  const [dupes] = await db
    .select({ value: count() })
    .from(properties)
    .where(eq(properties.status, "possible_duplicate"));
  const [drafts] = await db
    .select({ value: count() })
    .from(properties)
    .where(eq(properties.status, "draft"));
  const [review] = await db
    .select({ value: count() })
    .from(properties)
    .where(eq(properties.status, "review"));

  console.log("Total:", total?.value);
  console.log("Possible duplicates:", dupes?.value);
  console.log("Drafts:", drafts?.value);
  console.log("Review:", review?.value);
  process.exit(0);
}
main();
