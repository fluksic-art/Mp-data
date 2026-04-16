import type { StructuredContent } from "../schemas/structured-content.js";

/** Minimal property shape the supervisor rules operate on.
 *
 * Decoupled from the Drizzle schema row so rules can be tested without
 * a DB and so the admin UI can run reads against whatever projection
 * it has.
 */
export interface PropertyForSupervisor {
  id: string;
  title: string;
  propertyType: string;
  listingType: string;
  priceCents: number | null;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  constructionM2: number | null;
  landM2: number | null;
  parkingSpaces: number | null;
  country: string;
  state: string;
  city: string;
  neighborhood: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  contentEs: StructuredContent | null;
  contentEn: StructuredContent | null;
  contentFr: StructuredContent | null;
  rawData: Record<string, unknown>;
}
