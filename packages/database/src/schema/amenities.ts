import {
  pgTable,
  serial,
  uuid,
  text,
  primaryKey,
} from "drizzle-orm/pg-core";
import { properties } from "./properties.js";

export const amenities = pgTable("amenities", {
  id: serial().primaryKey(),
  slug: text().notNull().unique(),
  nameEs: text("name_es").notNull(),
  nameEn: text("name_en").notNull(),
  nameFr: text("name_fr").notNull(),
  category: text(),
});

export const propertyAmenities = pgTable(
  "property_amenities",
  {
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    amenityId: serial("amenity_id").references(() => amenities.id),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.amenityId] })],
);
