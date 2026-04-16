#!/usr/bin/env node
/**
 * Enrich mayaocean.com listings with unit-level data (bedrooms, baths, m²),
 * coordinates, and the full image gallery.
 *
 * Re-fetches each complex page and parses the React Server Components
 * stream (__next_f.push). The RSC payload contains a `complex` object with
 * `unitGroups[].units[]` including bedrooms/bathrooms/area/priceUsd/floorPlan,
 * plus accurate latitude/longitude and an `images` array.
 *
 * Aggregates per listing:
 *   bedrooms       = min bedrooms across all units
 *   bathrooms      = min bathrooms across all units with the min bedrooms tier
 *   construction_m2 = min area across all units
 * Full unit array and image gallery go into raw_data.
 */
import { eq, and, isNull } from "drizzle-orm";
import { createLogger } from "@mpgenesis/shared";
import {
  createDb,
  properties,
  sources,
  propertyImages,
} from "@mpgenesis/database";

const logger = createLogger("mayaocean-enrich");

const CONCURRENCY = Number(process.env.MAYAOCEAN_ENRICH_CONCURRENCY) || 4;
const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Unit {
  id: number;
  unitNumber?: string;
  unitType?: string;
  bedrooms: number;
  bathrooms: number;
  area: number;
  floor?: string;
  view?: string;
  priceBaseUsd?: number;
  priceBaseMxn?: number;
  priceUsd?: number;
  status?: string;
  floorPlan?: string;
  imageUrl?: string;
}

interface ComplexData {
  name?: string;
  latitude?: number;
  longitude?: number;
  images?: string[];
  imageUrl?: string;
  developmentPlan?: string;
  amenities?: string[];
  unitGroups?: { label: string; units: Unit[] }[];
}

function extractRscComplex(html: string): ComplexData | null {
  // Concatenate all __next_f.push chunks
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)];
  if (chunks.length === 0) return null;
  const combined = chunks
    .map((m) => m[1]!)
    .join("")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");

  // Find the complex object by locating a unit anchor and expanding to the containing object.
  // Strategy: locate "unitGroups": then scan back to the matching '{' that starts the complex.
  const anchor = combined.indexOf('"unitGroups":[');
  if (anchor < 0) return null;

  // Walk back to find the opening '{' whose matching close contains unitGroups.
  // Simpler: scan forward from some earlier key that marks the start of the complex object.
  // The complex object in the stream tends to contain "amenities", "latitude", "unitGroups"
  // close together. We walk back from `anchor` counting balanced braces.
  let depth = 0;
  let start = -1;
  for (let i = anchor; i >= 0; i--) {
    const c = combined[i];
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start < 0) return null;

  // Now walk forward from `start` to find the matching close brace.
  let end = -1;
  depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < combined.length; i++) {
    const c = combined[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;

  const raw = combined.slice(start, end + 1);
  try {
    return JSON.parse(raw) as ComplexData;
  } catch {
    return null;
  }
}

function aggregateUnits(complex: ComplexData): {
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  allUnits: Unit[];
} {
  const allUnits: Unit[] = [];
  for (const g of complex.unitGroups ?? []) {
    for (const u of g.units ?? []) {
      if (typeof u.bedrooms === "number" && typeof u.area === "number") {
        allUnits.push(u);
      }
    }
  }
  if (allUnits.length === 0) {
    return { bedrooms: null, bathrooms: null, areaM2: null, allUnits: [] };
  }
  const minBeds = Math.min(...allUnits.map((u) => u.bedrooms));
  // Among min-bedroom units, take min bathrooms and min area
  const minBedUnits = allUnits.filter((u) => u.bedrooms === minBeds);
  const minBaths = Math.min(...minBedUnits.map((u) => u.bathrooms ?? 0).filter((n) => n > 0));
  const minArea = Math.min(...minBedUnits.map((u) => u.area));
  return {
    bedrooms: minBeds,
    bathrooms: Number.isFinite(minBaths) && minBaths > 0 ? minBaths : null,
    areaM2: Number.isFinite(minArea) ? Math.round(minArea) : null,
    allUnits,
  };
}

function collectImages(complex: ComplexData, allUnits: Unit[]): string[] {
  const set = new Set<string>();
  if (complex.imageUrl) set.add(complex.imageUrl);
  for (const u of complex.images ?? []) set.add(u);
  if (complex.developmentPlan) set.add(complex.developmentPlan);
  for (const u of allUnits) {
    if (u.imageUrl) set.add(u.imageUrl);
    if (u.floorPlan) set.add(u.floorPlan);
  }
  return Array.from(set).filter((s) => /^https?:\/\//.test(s));
}

async function enrichOne(
  db: ReturnType<typeof createDb>,
  prop: { id: string; slug: string; sourceUrl: string; rawData: unknown },
): Promise<"enriched" | "no-data" | "error"> {
  let html = "";
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(prop.sourceUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          lastErr = `HTTP ${res.status}`;
          await sleep(1000 * attempt + Math.random() * 500);
          continue;
        }
        logger.warn({ slug: prop.slug, status: res.status }, "Fetch failed");
        return "error";
      }
      html = await res.text();
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await sleep(1000 * attempt + Math.random() * 500);
    }
  }
  if (lastErr) {
    logger.warn({ slug: prop.slug, error: String(lastErr) }, "Fetch failed after retries");
    return "error";
  }
  const complex = extractRscComplex(html);
  if (!complex) {
    logger.warn({ slug: prop.slug }, "No complex data in RSC");
    return "no-data";
  }

  const { bedrooms, bathrooms, areaM2, allUnits } = aggregateUnits(complex);
  const images = collectImages(complex, allUnits);

  const currentRaw = (prop.rawData ?? {}) as Record<string, unknown>;
  const newRaw = {
    ...currentRaw,
    image: images.length > 0 ? images : (currentRaw.image ?? []),
    units: allUnits,
    unitGroups: complex.unitGroups ?? [],
    amenities: complex.amenities ?? currentRaw.amenities ?? [],
  };

  await db
    .update(properties)
    .set({
      bedrooms,
      bathrooms,
      constructionM2: areaM2,
      latitude: complex.latitude ?? null,
      longitude: complex.longitude ?? null,
      rawData: newRaw,
      lastSeenAt: new Date(),
    })
    .where(eq(properties.id, prop.id));

  // Refresh property_images: replace with the new gallery
  if (images.length > 0) {
    // Wipe existing rows for this property, then insert fresh
    await db.delete(propertyImages).where(eq(propertyImages.propertyId, prop.id));
    for (let i = 0; i < images.length; i++) {
      await db.insert(propertyImages).values({
        propertyId: prop.id,
        position: i,
        originalUrl: images[i]!,
      });
    }
  }

  return "enriched";
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const iter = items[Symbol.iterator]();
  const workers = Array.from({ length: limit }, async () => {
    for (const item of iter) await worker(item);
  });
  await Promise.all(workers);
}

async function main() {
  const onlyN = Number(process.env.MAYAOCEAN_ENRICH_LIMIT) || 0;
  const db = createDb();

  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.domain, "mayaocean.com"));
  if (!source) throw new Error("mayaocean.com source not found");

  const onlyMissing = process.env.MAYAOCEAN_ENRICH_ONLY_MISSING === "1";
  const baseWhere = onlyMissing
    ? and(eq(properties.sourceId, source.id), isNull(properties.bedrooms))
    : eq(properties.sourceId, source.id);

  const allProps = await db
    .select({
      id: properties.id,
      slug: properties.sourceListingId,
      sourceUrl: properties.sourceUrl,
      rawData: properties.rawData,
    })
    .from(properties)
    .where(baseWhere);

  const targets = onlyN > 0 ? allProps.slice(0, onlyN) : allProps;

  logger.info({ total: targets.length }, "Starting enrichment");

  let enriched = 0;
  let noData = 0;
  let errors = 0;

  await runWithConcurrency(targets, CONCURRENCY, async (p) => {
    try {
      const result = await enrichOne(db, p);
      if (result === "enriched") enriched++;
      else if (result === "no-data") noData++;
      else errors++;
      const done = enriched + noData + errors;
      if (done % 25 === 0) {
        logger.info({ enriched, noData, errors, total: targets.length }, "Progress");
      }
    } catch (err) {
      errors++;
      logger.error({ slug: p.slug, error: String(err) }, "Enrich failed");
    }
  });

  logger.info({ enriched, noData, errors, total: targets.length }, "Enrichment complete");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: String(err) }, "Mayaocean enrich failed");
  process.exit(1);
});
