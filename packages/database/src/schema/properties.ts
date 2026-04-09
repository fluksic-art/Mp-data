import {
  pgTable,
  uuid,
  text,
  bigint,
  smallint,
  numeric,
  doublePrecision,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sources } from "./sources.js";
import { crawlRuns } from "./crawl-runs.js";

export const properties = pgTable(
  "properties",
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    sourceListingId: text("source_listing_id").notNull(),
    sourceUrl: text("source_url").notNull(),

    // Typed factual columns — P1: these NEVER touch the LLM
    title: text().notNull(),
    propertyType: text("property_type").notNull(),
    listingType: text("listing_type").notNull(),
    priceCents: bigint("price_cents", { mode: "number" }),
    currency: text().notNull().default("MXN"),
    bedrooms: smallint(),
    bathrooms: numeric({ precision: 3, scale: 1 }),
    constructionM2: numeric("construction_m2"),
    landM2: numeric("land_m2"),
    parkingSpaces: smallint("parking_spaces"),

    // Location
    country: text().notNull().default("MX"),
    state: text().notNull(),
    city: text().notNull(),
    neighborhood: text(),
    address: text(),
    postalCode: text("postal_code"),
    latitude: doublePrecision(),
    longitude: doublePrecision(),

    // Flexible data
    rawData: jsonb("raw_data").notNull().default({}),
    extractedData: jsonb("extracted_data").notNull().default({}),

    // Localized content (populated by paraphrase + translate workers)
    contentEs: jsonb("content_es"),
    contentEn: jsonb("content_en"),
    contentFr: jsonb("content_fr"),

    // Workflow
    status: text().notNull().default("draft"),
    contentHash: text("content_hash").notNull(),

    // Tracking
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastCrawlRunId: uuid("last_crawl_run_id").references(() => crawlRuns.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [unique("properties_source_unique").on(t.sourceId, t.sourceListingId)],
);
