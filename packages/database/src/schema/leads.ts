import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { properties } from "./properties.js";

export const leads = pgTable("leads", {
  id: uuid().primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  source: text().notNull(),
  name: text(),
  email: text(),
  phone: text(),
  message: text(),
  locale: text().notNull().default("es"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
