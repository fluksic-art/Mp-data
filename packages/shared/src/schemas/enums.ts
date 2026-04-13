import { z } from "zod/v4";

export const propertyTypeSchema = z.enum([
  "apartment",
  "house",
  "land",
  "villa",
  "penthouse",
  "office",
  "commercial",
]);
export type PropertyType = z.infer<typeof propertyTypeSchema>;

export const listingTypeSchema = z.enum(["sale", "rent", "presale"]);
export type ListingType = z.infer<typeof listingTypeSchema>;

export const currencySchema = z.enum(["MXN", "USD", "EUR"]);
export type Currency = z.infer<typeof currencySchema>;

export const sourceStatusSchema = z.enum([
  "pending",
  "active",
  "paused",
  "archived",
]);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const crawlRunStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
]);
export type CrawlRunStatus = z.infer<typeof crawlRunStatusSchema>;

export const propertyStatusSchema = z.enum([
  "draft",
  "review",
  "published",
  "archived",
  "possible_duplicate",
]);
export type PropertyStatus = z.infer<typeof propertyStatusSchema>;

export const amenityCategorySchema = z.enum([
  "interior",
  "exterior",
  "community",
  "security",
  "other",
]);
export type AmenityCategory = z.infer<typeof amenityCategorySchema>;
