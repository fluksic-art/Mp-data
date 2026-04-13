#!/usr/bin/env node
/**
 * Ingest listing.caribeluxuryhomes.com via their public REST API.
 *
 * Strategy: API → DB direct. No Playwright, no proxy, $0 cost.
 * Fetches all developments — each becomes one listing.
 * Properties API doesn't link to developments (developmentId=null),
 * so we use the aggregate data from the developments endpoint.
 *
 * This is a REFERENCE crawl — all listings stay as "draft" for cross-referencing.
 */
import { randomUUID, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  createLogger,
} from "@mpgenesis/shared";
import {
  createDb,
  sources,
  crawlRuns,
  properties,
  propertyImages,
} from "@mpgenesis/database";

const logger = createLogger("caribe-crawl");

const API_BASE = "https://listing.caribeluxuryhomes.com/api/public";
const SITE_BASE = "https://listing.caribeluxuryhomes.com/en";

// ── Types ──────────────────────────────────────────────────────────────────

interface ApiDevelopment {
  id: number;
  uuid: string;
  slug: string;
  name: string;
  fullAddress: string;
  image: string;
  galleryImages: string;
  developmentType: string;
  minPriceUsd: string;
  maxPriceUsd: string;
  minPriceMxn: string;
  maxPriceMxn: string;
  minSurface: string;
  maxSurface: string;
  avgSurface: string;
  availableUnits: number;
  totalUnits: number;
  buildings: number;
  floors: number;
  constructionProgress: string;
  constructionYear: number;
  deliveryDate: string | null;
  isImmediateDelivery: boolean;
  description: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  saleStage: string;
  latitude: number;
  longitude: number;
  catalogAmenities: string | null;
  extraAmenities: string | null;
  isFeatured: boolean;
  isExclusive: boolean;
  cityId: number;
  neighborhoodId: number;
  cityName: string;
  neighborhoodName: string;
}

// ── Amenity ID → label mapping ─────────────────────────────────────────────
const AMENITY_MAP: Record<string, string> = {
  "1": "Alberca",
  "2": "Gimnasio",
  "3": "Rooftop",
  "4": "Seguridad 24h",
  "5": "Elevador",
  "6": "Estacionamiento",
  "7": "Áreas verdes",
  "8": "Áreas infantiles",
  "9": "Pet friendly",
  "10": "Palapa / asadores",
  "13": "Cancha deportiva",
};

function resolveAmenities(catalogCsv: string | null, extra: string | null): string[] {
  const labels: string[] = [];
  if (catalogCsv) {
    for (const id of catalogCsv.split(",")) {
      const label = AMENITY_MAP[id.trim()];
      if (label) labels.push(label);
    }
  }
  if (extra) {
    for (const a of extra.split(",")) {
      const trimmed = a.trim();
      if (trimmed) labels.push(trimmed);
    }
  }
  return labels;
}

// ── Listing type from saleStage ────────────────────────────────────────────
function mapListingType(saleStage: string): "sale" | "rent" | "presale" {
  if (saleStage === "1" || saleStage.toLowerCase().includes("presale")) return "presale";
  if (saleStage === "2" || saleStage.toLowerCase().includes("resale")) return "sale";
  return "sale";
}

// ── Normalize for dedup ────────────────────────────────────────────────────
function normalizeForDedup(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const db = createDb();

  // Upsert source
  const [source] = await db
    .insert(sources)
    .values({
      domain: "listing.caribeluxuryhomes.com",
      name: "Caribe Luxury Homes",
      status: "active",
    })
    .onConflictDoUpdate({ target: sources.domain, set: { status: "active" } })
    .returning();
  if (!source) throw new Error("Failed to upsert source");

  // Create crawl run
  const crawlRunId = randomUUID();
  await db.insert(crawlRuns).values({
    id: crawlRunId,
    sourceId: source.id,
    status: "running",
  });

  logger.info({ sourceId: source.id, crawlRunId }, "Starting Caribe Luxury Homes crawl");

  // Fetch all developments in one call
  const res = await fetch(`${API_BASE}/developments?page=1&limit=1000`);
  if (!res.ok) throw new Error(`Developments API failed: ${res.status}`);
  const json = (await res.json()) as { data: ApiDevelopment[] };
  const developments = json.data;
  logger.info({ count: developments.length }, "Developments fetched");

  // Load existing properties from other sources for dedup
  const allOther = await db
    .select({
      developmentName: properties.developmentName,
      title: properties.title,
      sourceId: properties.sourceId,
    })
    .from(properties)
    .limit(5000);
  const otherNormalized = new Set(
    allOther
      .filter((p) => p.sourceId !== source.id)
      .map((p) => normalizeForDedup(p.developmentName ?? p.title)),
  );

  let inserted = 0;
  let duplicates = 0;
  const errors: Array<{ dev: string; error: string }> = [];

  for (const dev of developments) {
    try {
      const amenities = resolveAmenities(dev.catalogAmenities, dev.extraAmenities);
      const description = dev.descriptionEs || dev.descriptionEn || dev.description || "";

      // Price: prefer MXN, fall back to USD
      const priceMxn = parseFloat(dev.minPriceMxn);
      const priceUsd = parseFloat(dev.minPriceUsd);
      const priceCents = priceMxn > 0
        ? Math.round(priceMxn * 100)
        : priceUsd > 0
          ? Math.round(priceUsd * 100)
          : null;
      const currency = priceMxn > 0 ? "MXN" : "USD";

      // Image: cover only (galleryImages always empty at dev level)
      const imageUrls = dev.image ? [dev.image] : [];

      // Cross-source dedup
      const devNormalized = normalizeForDedup(dev.name);
      const isDuplicate =
        devNormalized.length >= 3 &&
        [...otherNormalized].some(
          (n) => n.includes(devNormalized) || devNormalized.includes(n),
        );

      const status = isDuplicate ? "possible_duplicate" : "draft";
      if (isDuplicate) duplicates++;

      const contentHash = createHash("sha256")
        .update(JSON.stringify({
          id: dev.id,
          name: dev.name,
          price: priceCents,
          units: dev.availableUnits,
        }))
        .digest("hex");

      const sourceUrl = dev.slug
        ? `${SITE_BASE}/development/${dev.slug}`
        : `${SITE_BASE}/developments`;

      // P4: Idempotent upsert
      const [upserted] = await db
        .insert(properties)
        .values({
          sourceId: source.id,
          sourceListingId: `dev-${dev.id}`,
          sourceUrl,
          title: dev.name,
          propertyType: "apartment",
          listingType: mapListingType(dev.saleStage),
          priceCents,
          currency,
          bedrooms: null,
          bathrooms: null,
          constructionM2: parseFloat(dev.avgSurface) > 0 ? dev.avgSurface : null,
          landM2: null,
          developerName: null,
          developmentName: dev.name,
          country: "MX",
          state: "Quintana Roo",
          city: dev.cityName,
          neighborhood: dev.neighborhoodName,
          latitude: dev.latitude,
          longitude: dev.longitude,
          rawData: {
            description,
            image: imageUrls,
            amenities,
            source: "caribeluxuryhomes",
            deliveryDate: dev.deliveryDate,
            availableUnits: dev.availableUnits,
            totalUnits: dev.totalUnits,
            buildings: dev.buildings,
            floors: dev.floors,
            constructionProgress: dev.constructionProgress,
            constructionYear: dev.constructionYear,
            priceRangeUsd: { min: dev.minPriceUsd, max: dev.maxPriceUsd },
            priceRangeMxn: { min: dev.minPriceMxn, max: dev.maxPriceMxn },
            surfaceRange: { min: dev.minSurface, max: dev.maxSurface, avg: dev.avgSurface },
            isFeatured: dev.isFeatured,
            isExclusive: dev.isExclusive,
          },
          extractedData: { tier: 0, pageUrl: sourceUrl },
          contentHash,
          lastCrawlRunId: crawlRunId,
          status,
        })
        .onConflictDoUpdate({
          target: [properties.sourceId, properties.sourceListingId],
          set: {
            title: dev.name,
            priceCents,
            currency,
            constructionM2: parseFloat(dev.avgSurface) > 0 ? dev.avgSurface : null,
            developmentName: dev.name,
            neighborhood: dev.neighborhoodName,
            latitude: dev.latitude,
            longitude: dev.longitude,
            rawData: {
              description,
              image: imageUrls,
              amenities,
              source: "caribeluxuryhomes",
              deliveryDate: dev.deliveryDate,
              availableUnits: dev.availableUnits,
              totalUnits: dev.totalUnits,
              buildings: dev.buildings,
              floors: dev.floors,
              constructionProgress: dev.constructionProgress,
              constructionYear: dev.constructionYear,
              priceRangeUsd: { min: dev.minPriceUsd, max: dev.maxPriceUsd },
              priceRangeMxn: { min: dev.minPriceMxn, max: dev.maxPriceMxn },
              surfaceRange: { min: dev.minSurface, max: dev.maxSurface, avg: dev.avgSurface },
              isFeatured: dev.isFeatured,
              isExclusive: dev.isExclusive,
            },
            contentHash,
            lastCrawlRunId: crawlRunId,
            lastSeenAt: new Date(),
          },
        })
        .returning({ id: properties.id });

      if (upserted) {
        // Insert images
        for (let i = 0; i < imageUrls.length; i++) {
          await db
            .insert(propertyImages)
            .values({
              propertyId: upserted.id,
              position: i,
              originalUrl: imageUrls[i]!,
            })
            .onConflictDoUpdate({
              target: [propertyImages.propertyId, propertyImages.position],
              set: { originalUrl: imageUrls[i]! },
            });
        }
      }

      inserted++;
      if (inserted % 50 === 0) {
        logger.info({ inserted, duplicates, total: developments.length }, "Progress");
        // Small pause to avoid overwhelming Supabase connection pool
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      const msg = String(err);
      logger.error({ dev: dev.name, error: msg }, "Failed to process development");
      errors.push({ dev: dev.name, error: msg });
    }
  }

  // Update crawl run
  await db
    .update(crawlRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      pagesCrawled: inserted,
      listingsExtracted: inserted,
      errors,
    })
    .where(eq(crawlRuns.id, crawlRunId));

  logger.info(
    { inserted, duplicates, errors: errors.length, crawlRunId },
    "Caribe Luxury Homes crawl complete",
  );
  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: String(err) }, "Caribe crawl failed");
  process.exit(1);
});
