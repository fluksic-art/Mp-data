import { z } from "zod/v4";

export const propertyImageSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  position: z.number().int().nonnegative(),
  originalUrl: z.string().url(),
  rawUrl: z.string().nullable().default(null),
  cleanUrl: z.string().nullable().default(null),
  altText: z.string().nullable().default(null),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  hasWatermarkRemoved: z.boolean().default(false),
  watermarkRemovalVersion: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
});
export type PropertyImage = z.infer<typeof propertyImageSchema>;
