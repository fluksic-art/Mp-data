import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export const sources = pgTable("sources", {
  id: uuid().primaryKey().defaultRandom(),
  domain: text().notNull().unique(),
  name: text().notNull(),
  crawlConfig: jsonb("crawl_config").notNull().default({}),
  watermarkConfig: jsonb("watermark_config")
    .notNull()
    .default({ enabled: false }),
  extractionSchema: jsonb("extraction_schema"),
  status: text().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
});
