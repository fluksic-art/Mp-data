import { z } from "zod/v4";
import { crawlRunStatusSchema } from "./enums.js";

export const crawlRunSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
  status: crawlRunStatusSchema.default("running"),
  pagesCrawled: z.number().int().nonnegative().default(0),
  listingsExtracted: z.number().int().nonnegative().default(0),
  errors: z.array(z.unknown()).default([]),
});
export type CrawlRun = z.infer<typeof crawlRunSchema>;
