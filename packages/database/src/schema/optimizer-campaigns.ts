import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export const optimizerCampaigns = pgTable("optimizer_campaigns", {
  id: uuid().primaryKey().defaultRandom(),

  rule: text().notNull(),
  severity: text().notNull(),
  category: text().notNull(),
  fixAction: text("fix_action").notNull(),
  fixParams: jsonb("fix_params").notNull().default({}),

  status: text().notNull().default("draft"),
  totalAffected: integer("total_affected").notNull().default(0),

  testIds: text("test_ids")
    .array()
    .notNull()
    .default([]),
  testStartedAt: timestamp("test_started_at", { withTimezone: true }),
  testDoneAt: timestamp("test_done_at", { withTimezone: true }),
  testBefore: jsonb("test_before"),
  testAfter: jsonb("test_after"),

  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rolloutStartedAt: timestamp("rollout_started_at", { withTimezone: true }),
  rolloutDoneAt: timestamp("rollout_done_at", { withTimezone: true }),
  rolloutFixed: integer("rollout_fixed").notNull().default(0),
  rolloutFailed: integer("rollout_failed").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
