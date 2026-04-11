import * as cheerio from "cheerio";
import type { ExtractedProperty } from "@mpgenesis/shared";
import { createLogger } from "@mpgenesis/shared";

const logger = createLogger("extract:tier1");

/** Tier 1 — Deterministic extraction (zero LLM cost).
 *
 * Extracts JSON-LD, OpenGraph, and meta tags from HTML.
 * Covers ~80% of sites that use Schema.org structured data.
 */
export function extractTier1(
  html: string,
  sourceUrl: string,
): Partial<ExtractedProperty> | null {
  const $ = cheerio.load(html);
  const jsonLd = extractJsonLd($);

  if (jsonLd) {
    logger.debug({ sourceUrl }, "Tier 1: Found JSON-LD");
    return mapJsonLdToProperty(jsonLd, sourceUrl);
  }

  // Fallback: try OpenGraph + meta tags
  const og = extractOpenGraph($);
  if (og.title) {
    logger.debug({ sourceUrl }, "Tier 1: Using OpenGraph fallback");
    return mapOgToProperty(og, sourceUrl);
  }

  logger.debug({ sourceUrl }, "Tier 1: No structured data found");
  return null;
}

interface JsonLdListing {
  "@type"?: string;
  name?: string;
  description?: string;
  url?: string;
  image?: string | string[];
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    offeredBy?: { name?: string; "@type"?: string };
  };
  brand?: { name?: string } | string;
  manufacturer?: { name?: string } | string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    addressCountry?: string;
    postalCode?: string;
  };
  geo?: {
    latitude?: number;
    longitude?: number;
  };
  floorSize?: {
    value?: string | number;
  };
  numberOfRooms?: number;
  numberOfBedrooms?: number;
  numberOfBathroomsTotal?: number;
  numberOfFullBathrooms?: number;
}

function extractJsonLd($: cheerio.CheerioAPI): JsonLdListing | null {
  const scripts = $('script[type="application/ld+json"]');
  let bestMatch: JsonLdListing | null = null;

  scripts.each((_, el) => {
    try {
      const text = $(el).text().trim();
      if (!text) return;

      const data: unknown = JSON.parse(text);

      // Handle @graph arrays
      const items = Array.isArray(data)
        ? data
        : isJsonLdGraph(data)
          ? (data as { "@graph": unknown[] })["@graph"]
          : [data];

      for (const item of items) {
        if (isRealEstateListing(item)) {
          bestMatch = item as JsonLdListing;
          return false; // break
        }
      }
    } catch {
      // Invalid JSON — skip
    }
  });

  return bestMatch;
}

function isJsonLdGraph(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "@graph" in data &&
    Array.isArray((data as Record<string, unknown>)["@graph"])
  );
}

const RE_TYPES = new Set([
  "RealEstateListing",
  "Apartment",
  "House",
  "SingleFamilyResidence",
  "Residence",
  "Product",
  "Offer",
]);

function isRealEstateListing(item: unknown): boolean {
  if (typeof item !== "object" || item === null) return false;
  const type = (item as Record<string, unknown>)["@type"];
  if (typeof type === "string") return RE_TYPES.has(type);
  if (Array.isArray(type)) return type.some((t) => RE_TYPES.has(String(t)));
  return false;
}

function mapJsonLdToProperty(
  ld: JsonLdListing,
  sourceUrl: string,
): Partial<ExtractedProperty> {
  const price = ld.offers?.price;
  const priceCents = price ? Math.round(Number(price) * 100) : null;
  const currency = ld.offers?.priceCurrency ?? "MXN";
  const title = decodeHtmlEntities(ld.name ?? "");
  const developerName =
    ld.offers?.offeredBy?.name ??
    extractNameField(ld.brand) ??
    extractNameField(ld.manufacturer) ??
    null;

  return {
    sourceUrl,
    title,
    propertyType: inferPropertyType(ld["@type"], title),
    priceCents: priceCents && !isNaN(priceCents) ? priceCents : null,
    currency: normalizeCurrency(currency),
    state: ld.address?.addressRegion ?? "",
    city: ld.address?.addressLocality ?? "",
    address: ld.address?.streetAddress ?? null,
    postalCode: ld.address?.postalCode ?? null,
    latitude: ld.geo?.latitude ?? null,
    longitude: ld.geo?.longitude ?? null,
    constructionM2: ld.floorSize?.value
      ? Number(ld.floorSize.value)
      : null,
    bedrooms: ld.numberOfBedrooms ?? ld.numberOfRooms ?? null,
    bathrooms:
      ld.numberOfBathroomsTotal ?? ld.numberOfFullBathrooms ?? null,
    developerName,
    // developmentName + slugAdjective are left for Tier 3 since they
    // require LLM reasoning over the full description.
    developmentName: null,
    slugAdjective: null,
    rawData: ld as Record<string, unknown>,
  };
}

/** Extract a `.name` field from a schema.org brand/manufacturer value,
 * which may be either a string or an object with `{name}`.
 */
function extractNameField(
  value: { name?: string } | string | undefined,
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.name ?? null;
}

/** Decode common HTML entities in text (for titles from JSON-LD) */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

/** Infer property type from JSON-LD @type and title keywords */
function inferPropertyType(
  jsonLdType: string | undefined,
  title: string,
): "apartment" | "house" | "land" | "villa" | "penthouse" | "office" | "commercial" {
  // Check JSON-LD @type first
  if (jsonLdType) {
    const t = jsonLdType.toLowerCase();
    if (t.includes("house") || t.includes("residence")) return "house";
    if (t.includes("apartment")) return "apartment";
  }

  // Fall back to title keyword matching
  const lower = title.toLowerCase();
  if (/\bpenthouse\b/.test(lower)) return "penthouse";
  if (/\bvilla\b/.test(lower)) return "villa";
  if (/\b(house|casa|home|maison)\b/.test(lower)) return "house";
  if (/\b(land|terreno|lot|plot)\b/.test(lower)) return "land";
  if (/\b(office|oficina)\b/.test(lower)) return "office";
  if (/\b(commercial|local)\b/.test(lower)) return "commercial";
  if (/\b(apartment|condo|departamento|loft|studio)\b/.test(lower))
    return "apartment";

  // Default
  return "apartment";
}

interface OgData {
  title: string | null;
  description: string | null;
  url: string | null;
  image: string | null;
  price: string | null;
  currency: string | null;
}

function extractOpenGraph($: cheerio.CheerioAPI): OgData {
  return {
    title:
      $('meta[property="og:title"]').attr("content") ??
      $("title").text() ??
      null,
    description:
      $('meta[property="og:description"]').attr("content") ??
      $('meta[name="description"]').attr("content") ??
      null,
    url: $('meta[property="og:url"]').attr("content") ?? null,
    image: $('meta[property="og:image"]').attr("content") ?? null,
    price:
      $('meta[property="product:price:amount"]').attr("content") ??
      $('meta[property="og:price:amount"]').attr("content") ??
      null,
    currency:
      $('meta[property="product:price:currency"]').attr("content") ??
      $('meta[property="og:price:currency"]').attr("content") ??
      null,
  };
}

function mapOgToProperty(
  og: OgData,
  sourceUrl: string,
): Partial<ExtractedProperty> {
  const priceCents = og.price ? Math.round(Number(og.price) * 100) : null;

  return {
    sourceUrl,
    title: og.title ?? "",
    priceCents: priceCents && !isNaN(priceCents) ? priceCents : null,
    currency: og.currency ? normalizeCurrency(og.currency) : "MXN",
    rawData: og as unknown as Record<string, unknown>,
  };
}

function normalizeCurrency(c: string): "MXN" | "USD" | "EUR" {
  const upper = c.toUpperCase();
  if (upper === "MXN" || upper === "USD" || upper === "EUR") {
    return upper;
  }
  return "MXN";
}
