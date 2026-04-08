import { z } from "zod/v4";
import { sourceStatusSchema } from "./enums.js";

export const watermarkConfigSchema = z.object({
  enabled: z.boolean(),
  strategy: z.literal("fixed-bbox").optional(),
  bbox: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
    })
    .optional(),
  anchor: z
    .enum([
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "center",
    ])
    .optional(),
  relative: z.boolean().optional(),
  validatedAt: z.string().datetime().optional(),
  validatedBy: z.string().optional(),
  sampleApprovedCount: z.number().int().nonnegative().optional(),
});
export type WatermarkConfig = z.infer<typeof watermarkConfigSchema>;

export const sourceSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  name: z.string(),
  crawlConfig: z.record(z.string(), z.unknown()).default({}),
  watermarkConfig: watermarkConfigSchema.default({ enabled: false }),
  extractionSchema: z.record(z.string(), z.unknown()).nullable().default(null),
  status: sourceStatusSchema.default("pending"),
  createdAt: z.string().datetime(),
  lastCrawledAt: z.string().datetime().nullable().default(null),
});
export type Source = z.infer<typeof sourceSchema>;

export const createSourceSchema = sourceSchema.pick({
  domain: true,
  name: true,
});
export type CreateSource = z.infer<typeof createSourceSchema>;
