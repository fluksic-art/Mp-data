import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  bigserial,
} from "drizzle-orm/pg-core";
import { properties } from "./properties.js";
import { crawlRuns } from "./crawl-runs.js";

export const propertyChanges = pgTable("property_changes", {
  id: bigserial({ mode: "number" }).primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  crawlRunId: uuid("crawl_run_id")
    .notNull()
    .references(() => crawlRuns.id),
  fieldName: text("field_name").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  detectedAt: timestamp("detected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
