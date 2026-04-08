import { z } from "zod/v4";
import {
  propertyTypeSchema,
  listingTypeSchema,
  currencySchema,
  propertyStatusSchema,
} from "./enums.js";

export const localizedContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  h1: z.string().optional(),
});
export type LocalizedContent = z.infer<typeof localizedContentSchema>;

export const propertySchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  sourceListingId: z.string(),
  sourceUrl: z.string().url(),

  // Typed factual columns — P1: these NEVER touch the LLM
  title: z.string(),
  propertyType: propertyTypeSchema,
  listingType: listingTypeSchema,
  priceCents: z.number().int().nonnegative().nullable().default(null),
  currency: currencySchema.default("MXN"),
  bedrooms: z.number().int().nonnegative().nullable().default(null),
  bathrooms: z.number().nonnegative().nullable().default(null),
  constructionM2: z.number().nonnegative().nullable().default(null),
  landM2: z.number().nonnegative().nullable().default(null),
  parkingSpaces: z.number().int().nonnegative().nullable().default(null),

  // Location
  country: z.string().default("MX"),
  state: z.string(),
  city: z.string(),
  neighborhood: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
  postalCode: z.string().nullable().default(null),
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),

  // Flexible data
  rawData: z.record(z.string(), z.unknown()).default({}),
  extractedData: z.record(z.string(), z.unknown()).default({}),

  // Localized content (populated by paraphrase + translate workers)
  contentEs: localizedContentSchema.nullable().default(null),
  contentEn: localizedContentSchema.nullable().default(null),
  contentFr: localizedContentSchema.nullable().default(null),

  // Workflow
  status: propertyStatusSchema.default("draft"),
  contentHash: z.string(),

  // Tracking
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  lastCrawlRunId: z.string().uuid().nullable().default(null),
  publishedAt: z.string().datetime().nullable().default(null),
});
export type Property = z.infer<typeof propertySchema>;

/** Schema for extraction output — what the extract worker produces */
export const extractedPropertySchema = propertySchema.pick({
  sourceListingId: true,
  sourceUrl: true,
  title: true,
  propertyType: true,
  listingType: true,
  priceCents: true,
  currency: true,
  bedrooms: true,
  bathrooms: true,
  constructionM2: true,
  landM2: true,
  parkingSpaces: true,
  state: true,
  city: true,
  neighborhood: true,
  address: true,
  postalCode: true,
  latitude: true,
  longitude: true,
  rawData: true,
});
export type ExtractedProperty = z.infer<typeof extractedPropertySchema>;
