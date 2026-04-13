#!/usr/bin/env node
/**
 * Ingest propiedadescancun.mx via their internal API (milkyway.virture.io).
 *
 * Strategy: API → DB direct. No HTML crawling needed.
 * The API returns structured JSON with all fields we need.
 * Only paraphrase/translate costs apply — $0 extraction, $0 proxy.
 */
import { Queue } from "bullmq";
import { randomUUID, createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import {
  QUEUE_NAMES,
  type ParaphraseJobData,
  type ImageProcessingJobData,
  getRedisConnection,
  createLogger,
} from "@mpgenesis/shared";
import {
  createDb,
  sources,
  crawlRuns,
  properties,
  propertyImages,
} from "@mpgenesis/database";

const logger = createLogger("propiedadescancun-ingest");

const API_BASE = "https://milkyway.virture.io/propiedades/v1";
const API_KEY =
  "3f82efaf20c588e2a126905739ce811b9997b91872522762e1eeea69d7d7d8a0.d444f4b59edaec326e303ebc1126e0313a7e2dc912db2c76f2c9761b8f1a1b32";
const WORKSPACE_ID = "66f610129265cfaa4c3f76cb";
const SITE_BASE = "https://propiedadescancun.mx";

interface ApiListItem {
  id: string;
  name: string;
  slug: string;
  short_slug: string;
  url: string;
  description: string;
  h1: string;
  price: number;
  currency: string;
  bathrooms: number;
  rooms: number;
  land: number;
  construction: number;
  propertyType: string;
  contractType: string[];
  location: string;
  city: string;
  zone: string;
  amenities: string[];
  imgUrl: string;
  mainPropertyName: string;
  priceSale: { priceSale: number } | number;
  pricePresale: { priceFrom: number } | number;
}

interface ApiDetail {
  id: string;
  name: string;
  description: string;
  title: string;
  slug: string;
  short_slug: string;
  large_slug: string;
  h1: string;
  seo: string;
  currency: string;
  prices: unknown;
  contractType: string[];
  imgUrl: string;
  characteristics: Array<{ name: string; value: string }>;
  location: { address: string; references: string | null; zone: string; city: string };
  amenities: Array<{
    name: string;
    type: string;
    amenities: Array<{ name: string; type: string }>;
    photos: Array<{ src: string; name: string; visible: boolean }>;
  }>;
  propertyType: string;
}

/** Fetch all developments from the list API via cursor pagination. */
async function fetchAllDevelopments(): Promise<ApiListItem[]> {
  const all: ApiListItem[] = [];
  let cursor: string | null = null;

  while (true) {
    const url = cursor
      ? `${API_BASE}/find-all?propertyType=Desarrollo&cursor=${cursor}`
      : `${API_BASE}/find-all?propertyType=Desarrollo`;

    const res = await fetch(url, {
      headers: { "x-api-key": API_KEY, "x-workspace-id": WORKSPACE_ID },
    });
    if (!res.ok) break;

    const data = (await res.json()) as {
      data: ApiListItem[];
      total: number;
      cursor: string | null;
    };

    all.push(...data.data);
    logger.info({ fetched: all.length, total: data.total }, "API page fetched");

    if (!data.cursor || all.length >= data.total) break;
    cursor = data.cursor;
  }

  return all;
}

/** Fetch detail for a single development (for photos + full amenities). */
async function fetchDetail(shortSlug: string): Promise<ApiDetail | null> {
  try {
    const res = await fetch(
      `${API_BASE}/find-one-by-slug/${shortSlug}?isLargeSlug=false`,
      { headers: { "x-api-key": API_KEY, "x-workspace-id": WORKSPACE_ID } },
    );
    if (!res.ok) return null;
    return (await res.json()) as ApiDetail;
  } catch {
    return null;
  }
}

/** Map API listing type to our enum. */
function mapListingType(contractTypes: string[]): "sale" | "rent" | "presale" {
  const ct = contractTypes.map((c) => c.toLowerCase());
  if (ct.includes("preventa") || ct.includes("pre-venta")) return "presale";
  if (ct.includes("renta")) return "rent";
  return "sale";
}

/** Map API property type to our enum. */
function mapPropertyType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("departamento") || t.includes("condominio")) return "apartment";
  if (t.includes("casa")) return "house";
  if (t.includes("terreno") || t.includes("lote")) return "land";
  if (t.includes("penthouse")) return "penthouse";
  if (t.includes("villa")) return "villa";
  if (t.includes("oficina")) return "office";
  if (t.includes("comercial") || t.includes("local")) return "commercial";
  return "apartment"; // default for "Desarrollo"
}

/** Extract all photo URLs from detail amenities. */
function extractPhotos(detail: ApiDetail): string[] {
  const photos: string[] = [];
  for (const group of detail.amenities) {
    for (const photo of group.photos) {
      if (photo.visible && photo.src) {
        photos.push(photo.src);
      }
    }
  }
  if (photos.length === 0 && detail.imgUrl) {
    photos.push(detail.imgUrl);
  }
  return photos;
}

/** Normalize for cross-source duplicate detection. */
function normalizeForDedup(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const maxProperties = process.argv[2] ? Number(process.argv[2]) : 200;
  const db = createDb();

  // Upsert source
  const [source] = await db
    .insert(sources)
    .values({ domain: "propiedadescancun.mx", name: "Propiedades Cancun", status: "active" })
    .onConflictDoUpdate({ target: sources.domain, set: { status: "active" } })
    .returning();
  if (!source) throw new Error("Failed to upsert source");

  // Fetch all developments from API
  const developments = await fetchAllDevelopments();
  const toProcess = developments.slice(0, maxProperties);
  logger.info({ total: developments.length, processing: toProcess.length }, "Developments loaded");

  // Load existing properties from other sources for dedup
  const otherProps = await db
    .select({ developmentName: properties.developmentName, title: properties.title })
    .from(properties)
    .where(and(
      // Only compare against other sources
      eq(properties.sourceId, source.id) ? undefined! : undefined!,
    ));
  // Simpler: just get all from other sources
  const allOther = await db
    .select({ developmentName: properties.developmentName, title: properties.title, sourceId: properties.sourceId })
    .from(properties)
    .limit(3000);
  const otherNormalized = new Set(
    allOther
      .filter((p) => p.sourceId !== source.id)
      .map((p) => normalizeForDedup(p.developmentName ?? p.title)),
  );

  const crawlRunId = randomUUID();
  await db.insert(crawlRuns).values({
    id: crawlRunId,
    sourceId: source.id,
    status: "running",
  });

  const paraphraseQueue = new Queue<ParaphraseJobData>(QUEUE_NAMES.PARAPHRASE, {
    connection: getRedisConnection(),
  });
  const imageQueue = new Queue<ImageProcessingJobData>(QUEUE_NAMES.IMAGE_PROCESSING, {
    connection: getRedisConnection(),
  });

  let inserted = 0;
  let duplicates = 0;
  let skipped = 0;

  for (const dev of toProcess) {
    const sourceListingId = dev.id;
    const pageUrl = `${SITE_BASE}/${dev.url}`;

    // Fetch detail for enriched data (photos, characteristics, full description)
    const detail = await fetchDetail(dev.short_slug);
    const photos = detail ? extractPhotos(detail) : dev.imgUrl ? [dev.imgUrl] : [];

    // Enrich from detail characteristics
    const chars = detail?.characteristics as Record<string, unknown> | undefined;
    const devChars = (chars?.propertyDevelopment ?? {}) as Record<string, number>;
    const localChars = (chars?.propertyLocal ?? {}) as Record<string, number>;
    const landFromChars = (chars?.land as number) ?? 0;
    const constructionFromChars = (chars?.construction as number) ?? 0;

    // Best rooms/bathrooms: prefer detail > list, skip 0
    const bedrooms =
      (devChars.roomFrom || 0) > 0 ? devChars.roomFrom
      : (localChars.rooms || 0) > 0 ? localChars.rooms
      : dev.rooms > 0 ? dev.rooms
      : null;

    const bathrooms =
      (devChars.bathroomsFrom || 0) > 0 ? devChars.bathroomsFrom
      : (localChars.bathrooms || 0) > 0 ? localChars.bathrooms
      : dev.bathrooms > 0 ? dev.bathrooms
      : null;

    const constructionM2 =
      constructionFromChars > 0 ? constructionFromChars
      : dev.construction > 0 ? dev.construction
      : null;

    const landM2 =
      landFromChars > 0 ? landFromChars
      : dev.land > 0 ? dev.land
      : null;

    // Best price: detail prices > list price
    const detailPrices = (detail?.prices ?? {}) as Record<string, number>;
    const priceRaw =
      (detailPrices.priceSale || 0) > 0 ? detailPrices.priceSale
      : (detailPrices.minPrice || 0) > 0 ? detailPrices.minPrice
      : typeof dev.priceSale === "object" && dev.priceSale.priceSale > 0 ? dev.priceSale.priceSale
      : dev.price > 0 ? dev.price
      : 0;
    const priceCents = (priceRaw ?? 0) > 0 ? Math.round(priceRaw! * 100) : null;

    // Price range for rawData
    const priceFrom = (detailPrices.minPrice || 0) > 0 ? detailPrices.minPrice : null;
    const priceUp = (detailPrices.maxPrice || 0) > 0 ? detailPrices.maxPrice : null;

    // Full description from detail (much richer than list)
    const descriptionHtml = detail?.description ?? dev.description ?? "";
    const descriptionText = descriptionHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Collect all amenity names
    const allAmenities: string[] = [];
    if (detail?.amenities) {
      for (const group of detail.amenities) {
        for (const a of group.amenities ?? []) {
          allAmenities.push(a.name);
        }
      }
    } else {
      allAmenities.push(...(dev.amenities ?? []));
    }

    // Parking from characteristics
    const parkingFrom = (chars?.parkingSpacesFrom as number) ?? null;

    const contentHash = createHash("sha256")
      .update(JSON.stringify({ dev, detail: detail?.id }))
      .digest("hex");

    // Check for cross-source duplicate
    const devNormalized = normalizeForDedup(dev.name);
    const isDuplicate =
      devNormalized.length >= 3 &&
      [...otherNormalized].some(
        (n) => n.includes(devNormalized) || devNormalized.includes(n),
      );

    const status = isDuplicate ? "possible_duplicate" : "draft";
    if (isDuplicate) duplicates++;

    // Location from detail (richer) or list
    const loc = detail?.location;
    const zone = loc?.zone ?? dev.zone ?? "";
    const city = loc?.city ?? dev.city ?? "Cancún";
    const address = loc?.address ?? null;

    // Upsert property (always update to enrich)
    await db
      .insert(properties)
      .values({
        sourceId: source.id,
        sourceListingId: sourceListingId,
        sourceUrl: pageUrl,
        title: detail?.h1 ?? dev.h1 ?? dev.name,
        propertyType: mapPropertyType(dev.propertyType),
        listingType: mapListingType(dev.contractType),
        priceCents,
        currency: dev.currency === "USD" ? "USD" : "MXN",
        bedrooms,
        bathrooms,
        constructionM2,
        landM2,
        parkingSpaces: parkingFrom,
        developerName: dev.mainPropertyName || null,
        developmentName: dev.name,
        country: "MX",
        state: "Quintana Roo",
        city,
        neighborhood: zone || null,
        address,
        rawData: {
          description: descriptionText,
          image: photos,
          amenities: allAmenities,
          priceFrom,
          priceUp,
          apiId: dev.id,
          situation: (dev as unknown as Record<string, unknown>).situation,
          estimatedDelivery: (dev as unknown as Record<string, unknown>).estimatedDelivery,
        },
        contentHash,
        lastCrawlRunId: crawlRunId,
        status,
      })
      .onConflictDoUpdate({
        target: [properties.sourceId, properties.sourceListingId],
        set: {
          title: detail?.h1 ?? dev.h1 ?? dev.name,
          priceCents,
          currency: dev.currency === "USD" ? "USD" : "MXN",
          bedrooms,
          bathrooms,
          constructionM2,
          landM2,
          parkingSpaces: parkingFrom,
          neighborhood: zone || null,
          address,
          rawData: {
            description: descriptionText,
            image: photos,
            amenities: allAmenities,
            priceFrom,
            priceUp,
            apiId: dev.id,
            situation: (dev as unknown as Record<string, unknown>).situation,
            estimatedDelivery: (dev as unknown as Record<string, unknown>).estimatedDelivery,
          },
          contentHash,
          lastSeenAt: new Date(),
          lastCrawlRunId: crawlRunId,
        },
      });

    // Fetch stored ID
    const [stored] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(
        and(
          eq(properties.sourceId, source.id),
          eq(properties.sourceListingId, sourceListingId),
        ),
      )
      .limit(1);

    if (!stored) continue;
    inserted++;

    // Enqueue images
    for (let i = 0; i < photos.length; i++) {
      await db
        .insert(propertyImages)
        .values({ propertyId: stored.id, position: i, originalUrl: photos[i]! })
        .onConflictDoUpdate({
          target: [propertyImages.propertyId, propertyImages.position],
          set: { originalUrl: photos[i]! },
        });

      await imageQueue.add(QUEUE_NAMES.IMAGE_PROCESSING, {
        sourceId: source.id,
        crawlRunId,
        propertyId: stored.id,
        imageUrl: photos[i]!,
        position: i,
      });
    }

    // Enqueue paraphrase only if not duplicate and has description
    if (!isDuplicate && descriptionText.length >= 50) {
      await paraphraseQueue.add(QUEUE_NAMES.PARAPHRASE, {
        sourceId: source.id,
        crawlRunId,
        propertyId: stored.id,
        description: descriptionText,
      });
    }

    if (inserted % 10 === 0) {
      logger.info(
        { inserted, duplicates, skipped, total: toProcess.length },
        `Progress: ${inserted + skipped}/${toProcess.length}`,
      );
    }
  }

  await paraphraseQueue.close();
  await imageQueue.close();

  await db
    .update(crawlRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      pagesCrawled: inserted + skipped,
      listingsExtracted: inserted,
    })
    .where(eq(crawlRuns.id, crawlRunId));

  logger.info(
    { inserted, duplicates, skipped, total: toProcess.length },
    "Ingest complete",
  );
  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: String(err) }, "Ingest failed");
  process.exit(1);
});
