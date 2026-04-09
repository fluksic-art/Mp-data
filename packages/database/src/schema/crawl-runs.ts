import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { sources } from "./sources.js";

export const crawlRuns = pgTable("crawl_runs", {
  id: uuid().primaryKey().defaultRandom(),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => sources.id),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text().notNull().default("running"),
  pagesCrawled: integer("pages_crawled").notNull().default(0),
  listingsExtracted: integer("listings_extracted").notNull().default(0),
  errors: jsonb().notNull().default([]),
});
