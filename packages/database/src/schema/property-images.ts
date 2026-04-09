import {
  pgTable,
  uuid,
  text,
  smallint,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { properties } from "./properties.js";

export const propertyImages = pgTable("property_images", {
  id: uuid().primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  position: smallint().notNull(),
  originalUrl: text("original_url").notNull(),
  rawUrl: text("raw_url"),
  cleanUrl: text("clean_url"),
  altText: text("alt_text"),
  width: integer(),
  height: integer(),
  hasWatermarkRemoved: boolean("has_watermark_removed")
    .notNull()
    .default(false),
  watermarkRemovalVersion: text("watermark_removal_version"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
