#!/usr/bin/env node
/**
 * Ingest goodlers.com via Playwright + Nuxt __NUXT__ state extraction.
 *
 * Strategy: SPA render → extract structured data from window.__NUXT__ → DB direct.
 * Each development has subProperties (models/tipologías) — each becomes a separate listing.
 * No LLM needed — all data is structured in the Nuxt state.
 *
 * Cost: $0 extraction, only proxy bandwidth for Playwright renders.
 */
import { chromium, type BrowserContext } from "playwright";
import { randomUUID, createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
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
import { randomUserAgent, randomDelay } from "./stealth.js";
import { blockResources } from "./resource-blocker.js";
import { getPlaywrightProxy } from "./proxy-config.js";

const logger = createLogger("goodlers-crawl");

const SITE_BASE = "https://goodlers.com";

// ── City code mapping ──────────────────────────────────────────────────────
interface CityInfo {
  state: string;
  city: string;
}

const CITY_MAP: Record<string, CityInfo> = {
  MX_MID: { state: "Yucatán", city: "Mérida" },
  MX_PRG: { state: "Yucatán", city: "Progreso" },
  MX_TUL: { state: "Quintana Roo", city: "Tulum" },
  MX_PCM: { state: "Quintana Roo", city: "Playa del Carmen" },
  // Fallbacks
  MX_CUN: { state: "Quintana Roo", city: "Cancún" },
};

function resolveCityInfo(cityCode: string): CityInfo {
  return CITY_MAP[cityCode] ?? { state: "Yucatán", city: "Mérida" };
}

// ── Property type mapping ──────────────────────────────────────────────────
function mapPropertyType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("departamento") || t.includes("condominio")) return "apartment";
  if (t.includes("casa") || t.includes("residencia")) return "house";
  if (t.includes("terreno") || t.includes("lote")) return "land";
  if (t.includes("penthouse")) return "penthouse";
  if (t.includes("villa")) return "villa";
  if (t.includes("oficina")) return "office";
  if (t.includes("comercial") || t.includes("local")) return "commercial";
  return "apartment";
}

// ── Listing type from tags ─────────────────────────────────────────────────
function inferListingType(tags: string[]): "sale" | "rent" | "presale" {
  if (tags.some((t) => t === "preventa")) return "presale";
  if (tags.some((t) => t === "renta")) return "rent";
  return "sale";
}

// ── Slug adjective from tags ───────────────────────────────────────────────
function inferSlugAdjective(tags: string[], amenityIds: string[]): string | null {
  if (tags.includes("frentealmar") || amenityIds.includes("frentealmar")) return "frente-al-mar";
  if (tags.includes("vistaalmar") || amenityIds.includes("vistaalmar")) return "vista-al-mar";
  if (tags.includes("conalberca") || amenityIds.includes("alberca") || amenityIds.includes("piscina")) return "con-alberca";
  if (amenityIds.includes("rooftop")) return "con-rooftop";
  if (tags.includes("privado") || tags.includes("seguridad24h")) return "privado";
  if (tags.includes("delujo") || tags.includes("luxury")) return "de-lujo";
  if (tags.includes("amueblado")) return "amueblado";
  return null;
}

// ── Nuxt state types ───────────────────────────────────────────────────────
interface NuxtSubProperty {
  id: number;
  extId: string;
  desc: string;
  propertyType: string;
  price: number;
  priceRange: { min: number; max: number };
  currency: string;
  surface: { total: number; built: number };
  bedrooms: { min: number; max: number };
  bathrooms: { min: number; max: number };
  rooms: { bed: number; bath: number };
  tags: string[];
  address: string;
  lat: number;
  lng: number;
}

interface NuxtProperty {
  id: number;
  extId: string;
  desc: string;
  propertyType: string;
  subPropertyTypes: string[];
  city: string;
  zone: string;
  address: string;
  lat: number;
  lng: number;
  currency: string;
  priceRange: {
    venta: { min: number; max: number };
    renta: { min: number; max: number };
  };
  amenities: Array<{ amenity: { id: string; desc: string } }>;
  allDetails: {
    localizedText: { es: string; en: string };
    amenitiesDetails: Record<string, { rank: number; details: string }>;
    whatsappPhone?: { phone: string };
    subPropertyTypes: string[];
  };
  assignedTo: Array<{ id: string; desc: string }>;
  files: Array<{ id: number; file: string; fileType: string; fileDesc: string }>;
  brochure: Array<{ id: number; file: string; fileType: string; fileDesc: string }>;
  pricelist: Array<{ id: number; file: string; fileType: string; fileDesc: string }>;
  pricelistImg: Array<{ id: number; picture: string; fileType: string; fileDesc: string; alt: string }>;
  video: string | null;
  videoUrls: Array<{ desc: string; type: string; url: string; rank: number }>;
  url: string | null;
  urls: Array<{ url: string; desc: string; rank: number; type: string }>;
  tags: string[];
  children: number[];
  subProperties: NuxtSubProperty[];
}

// ── Sitemap parsing ────────────────────────────────────────────────────────
async function fetchPropertyUrlsFromSitemap(): Promise<string[]> {
  const res = await fetch(`${SITE_BASE}/sitemap.xml`);
  if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status}`);

  const xml = await res.text();
  const urls: string[] = [];

  // Extract <loc> entries that match property detail pattern: /state/city/slug
  const locRegex = /<loc>(.*?)<\/loc>/g;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1]!;
    // Property detail: /prop/city/slug (3 segments after domain)
    const path = url.replace(SITE_BASE, "");
    const segments = path.split("/").filter(Boolean);
    // Must be exactly 3 segments starting with "prop": prop/city/slug
    // Exclude companies, category pages, and characteristic filters
    if (
      segments.length === 3 &&
      segments[0] === "prop" &&
      !segments[2]!.includes("caracteristicas") &&
      !["casas", "departamentos", "terrenos", "oficinas"].includes(segments[2]!)
    ) {
      urls.push(url);
    }
  }

  return urls;
}

// ── Extract Nuxt state from page ───────────────────────────────────────────
async function extractNuxtProperty(
  context: BrowserContext,
  url: string,
): Promise<NuxtProperty | null> {
  const page = await context.newPage();
  await blockResources(page);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const property = await page.evaluate(() => {
      const w = window as any;
      const nuxt = w.__NUXT__;
      if (!nuxt?.fetch?.[0]?.property) return null;
      return nuxt.fetch[0].property;
    });

    return property as NuxtProperty | null;
  } catch (err) {
    logger.error({ url, error: String(err) }, "Failed to extract Nuxt state");
    return null;
  } finally {
    await page.close();
  }
}

// ── Extract image URLs from files ──────────────────────────────────────────
function extractImageUrls(files: NuxtProperty["files"]): string[] {
  return files
    .filter((f) => f.fileType.startsWith("img-main-gallery"))
    .map((f) => f.file);
}

// ── Extract enrichment data (brochures, pricelists, plans, videos) ─────────
interface EnrichmentFiles {
  brochureUrls: string[];
  pricelistUrls: string[];
  pricelistImages: string[];
  planUrls: string[];
  progressImages: string[];
  videoUrls: string[];
  websiteUrl: string | null;
}

function extractEnrichmentFiles(property: NuxtProperty): EnrichmentFiles {
  const brochureUrls = (property.brochure ?? []).map((b) => b.file).filter(Boolean);
  const pricelistUrls = (property.pricelist ?? []).map((p) => p.file).filter(Boolean);
  const pricelistImages = (property.pricelistImg ?? []).map((p) => p.picture).filter(Boolean);

  // Plans and progress images from files array
  const planUrls = (property.files ?? [])
    .filter((f) => f.fileType === "plans")
    .map((f) => f.file);
  const progressImages = (property.files ?? [])
    .filter((f) => f.fileType.startsWith("img-progress"))
    .map((f) => f.file);

  // Videos
  const videoUrls: string[] = [];
  if (property.video) videoUrls.push(property.video);
  for (const v of property.videoUrls ?? []) {
    if (v.url && !videoUrls.includes(v.url)) videoUrls.push(v.url);
  }

  // Website
  const websiteUrl = property.url
    || (property.urls ?? []).find((u) => u.url)?.url
    || null;

  return { brochureUrls, pricelistUrls, pricelistImages, planUrls, progressImages, videoUrls, websiteUrl };
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
  const maxProperties = process.argv[2] ? Number(process.argv[2]) : 20;
  const db = createDb();

  // Upsert source
  const [source] = await db
    .insert(sources)
    .values({ domain: "goodlers.com", name: "Goodlers", status: "active" })
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

  const sourceId = source.id;
  logger.info({ sourceId, crawlRunId, maxProperties }, "Starting Goodlers crawl");

  // Get property URLs from sitemap
  const allUrls = await fetchPropertyUrlsFromSitemap();
  const urls = allUrls.slice(0, maxProperties);
  logger.info({ totalSitemap: allUrls.length, processing: urls.length }, "URLs loaded from sitemap");

  // Load existing properties for dedup
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
      .filter((p) => p.sourceId !== sourceId)
      .map((p) => normalizeForDedup(p.developmentName ?? p.title)),
  );

  // Launch browser — parallel contexts for speed
  const CONCURRENCY = 5;
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  logger.info({ concurrency: CONCURRENCY }, "Browser launched");

  let totalListings = 0;
  let duplicates = 0;
  let developmentsProcessed = 0;
  const errors: Array<{ url: string; error: string }> = [];

  // Process in parallel chunks
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const chunk = urls.slice(i, i + CONCURRENCY);
    await Promise.allSettled(chunk.map((url) => processUrl(url)));
    if (developmentsProcessed % 25 === 0 && developmentsProcessed > 0) {
      logger.info({ developmentsProcessed, totalListings, total: urls.length }, "Progress");
    }
  }

  async function processUrl(url: string): Promise<void> {
    const ctx = await browser.newContext({ userAgent: randomUserAgent() });
    try {
      const property = await extractNuxtProperty(ctx, url);
      if (!property) {
        errors.push({ url, error: "No Nuxt state found" });
        return;
      }

      developmentsProcessed++;
      const cityInfo = resolveCityInfo(property.city);
      const amenityIds = property.amenities.map((a) => a.amenity.id);
      const amenityLabels = property.amenities.map((a) => a.amenity.desc);
      const developerName = property.assignedTo?.[0]?.desc ?? null;
      const imageUrls = extractImageUrls(property.files);
      const description = property.allDetails?.localizedText?.es ?? "";
      const enrichment = extractEnrichmentFiles(property);

      // Check cross-source duplicate at development level
      const devNormalized = normalizeForDedup(property.desc);
      const isDevelopmentDuplicate =
        devNormalized.length >= 3 &&
        [...otherNormalized].some(
          (n) => n.includes(devNormalized) || devNormalized.includes(n),
        );

      const models = property.subProperties ?? [];

      if (models.length === 0) {
        // Development without models — create single listing from parent data
        const sourceListingId = property.extId;
        const subType = property.subPropertyTypes?.[0] ?? "departamento";
        const priceCents =
          property.priceRange?.venta?.min > 0
            ? Math.round(property.priceRange.venta.min * 100)
            : null;

        const contentHash = createHash("sha256")
          .update(JSON.stringify({ id: property.id, desc: property.desc, price: priceCents }))
          .digest("hex");

        const status = isDevelopmentDuplicate ? "possible_duplicate" : "draft";
        if (isDevelopmentDuplicate) duplicates++;

        await upsertListing(db, {
          sourceId,
          crawlRunId,
          sourceListingId,
          sourceUrl: url,
          title: property.desc,
          propertyType: mapPropertyType(subType),
          listingType: inferListingType(property.tags),
          priceCents,
          currency: property.currency === "USD" ? "USD" : "MXN",
          bedrooms: null,
          bathrooms: null,
          constructionM2: null,
          landM2: null,
          developerName,
          developmentName: property.desc,
          slugAdjective: inferSlugAdjective(property.tags, amenityIds),
          state: cityInfo.state,
          city: cityInfo.city,
          neighborhood: property.zone || property.address || null,
          latitude: property.lat,
          longitude: property.lng,
          description,
          imageUrls,
          amenityIds,
          amenityLabels,
          enrichment,
          contentHash,
          status,
        });
        totalListings++;
      } else {
        // One listing per model/tipología
        for (const model of models) {
          const sourceListingId = model.extId;
          const priceCents =
            model.priceRange?.min > 0
              ? Math.round(model.priceRange.min * 100)
              : null;

          // Use model-specific data, fall back to parent
          const bedrooms = model.bedrooms?.max > 0 ? model.bedrooms.max : null;
          const bathrooms = model.bathrooms?.max > 0 ? model.bathrooms.max : null;
          const constructionM2 = model.surface?.built > 0 ? model.surface.built : null;
          const landM2 = model.surface?.total > 0 ? model.surface.total : null;

          const modelTitle = `${property.desc} — ${model.desc}`;

          const contentHash = createHash("sha256")
            .update(
              JSON.stringify({
                id: model.id,
                desc: model.desc,
                price: priceCents,
                bedrooms,
                bathrooms,
              }),
            )
            .digest("hex");

          const status = isDevelopmentDuplicate ? "possible_duplicate" : "draft";
          if (isDevelopmentDuplicate) duplicates++;

          await upsertListing(db, {
            sourceId,
            crawlRunId,
            sourceListingId,
            sourceUrl: url,
            title: modelTitle,
            propertyType: mapPropertyType(model.propertyType),
            listingType: inferListingType(model.tags ?? property.tags),
            priceCents,
            currency: (model.currency ?? property.currency) === "USD" ? "USD" : "MXN",
            bedrooms,
            bathrooms,
            constructionM2,
            landM2,
            developerName,
            developmentName: property.desc,
            slugAdjective: inferSlugAdjective(model.tags ?? property.tags, amenityIds),
            state: cityInfo.state,
            city: cityInfo.city,
            neighborhood: property.zone || property.address || null,
            latitude: model.lat || property.lat,
            longitude: model.lng || property.lng,
            description,
            imageUrls,
            amenityIds,
            amenityLabels,
            enrichment,
            contentHash,
            status,
          });
          totalListings++;
        }
      }

      logger.info(
        {
          url,
          development: property.desc,
          models: models.length,
          developmentsProcessed,
          totalListings,
        },
        "Development processed",
      );

    } catch (err) {
      const msg = String(err);
      logger.error({ url, error: msg }, "Failed to process development");
      errors.push({ url, error: msg });
    } finally {
      await ctx.close();
    }
  }

  await browser.close();

  // Update crawl run
  await db
    .update(crawlRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      pagesCrawled: developmentsProcessed,
      listingsExtracted: totalListings,
      errors,
    })
    .where(eq(crawlRuns.id, crawlRunId));

  logger.info(
    {
      developmentsProcessed,
      totalListings,
      duplicates,
      errors: errors.length,
      crawlRunId,
    },
    "Goodlers crawl complete",
  );
  process.exit(0);
}

// ── Upsert a single listing ────────────────────────────────────────────────
interface ListingData {
  sourceId: string;
  crawlRunId: string;
  sourceListingId: string;
  sourceUrl: string;
  title: string;
  propertyType: string;
  listingType: "sale" | "rent" | "presale";
  priceCents: number | null;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  constructionM2: number | null;
  landM2: number | null;
  developerName: string | null;
  developmentName: string;
  slugAdjective: string | null;
  state: string;
  city: string;
  neighborhood: string | null;
  latitude: number;
  longitude: number;
  description: string;
  imageUrls: string[];
  amenityIds: string[];
  amenityLabels: string[];
  enrichment: EnrichmentFiles;
  contentHash: string;
  status: string;
}

async function upsertListing(
  db: ReturnType<typeof createDb>,
  data: ListingData,
): Promise<void> {
  // P4: Idempotent upsert
  const [upserted] = await db
    .insert(properties)
    .values({
      sourceId: data.sourceId,
      sourceListingId: data.sourceListingId,
      sourceUrl: data.sourceUrl,
      title: data.title,
      propertyType: data.propertyType,
      listingType: data.listingType,
      priceCents: data.priceCents,
      currency: data.currency,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms ? String(data.bathrooms) as unknown as number : null,
      constructionM2: data.constructionM2 ? String(data.constructionM2) as unknown as number : null,
      landM2: data.landM2 ? String(data.landM2) as unknown as number : null,
      developerName: data.developerName,
      developmentName: data.developmentName,
      slugAdjective: data.slugAdjective,
      country: "MX",
      state: data.state,
      city: data.city,
      neighborhood: data.neighborhood,
      latitude: data.latitude,
      longitude: data.longitude,
      rawData: {
        description: data.description,
        image: data.imageUrls,
        amenities: data.amenityLabels,
        source: "goodlers",
        brochureUrls: data.enrichment.brochureUrls,
        pricelistUrls: data.enrichment.pricelistUrls,
        pricelistImages: data.enrichment.pricelistImages,
        planUrls: data.enrichment.planUrls,
        progressImages: data.enrichment.progressImages,
        videoUrls: data.enrichment.videoUrls,
        websiteUrl: data.enrichment.websiteUrl,
      },
      extractedData: { tier: 0, pageUrl: data.sourceUrl },
      contentHash: data.contentHash,
      lastCrawlRunId: data.crawlRunId,
      status: data.status,
    })
    .onConflictDoUpdate({
      target: [properties.sourceId, properties.sourceListingId],
      set: {
        title: data.title,
        propertyType: data.propertyType,
        listingType: data.listingType,
        priceCents: data.priceCents,
        currency: data.currency,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms ? String(data.bathrooms) as unknown as number : null,
        constructionM2: data.constructionM2 ? String(data.constructionM2) as unknown as number : null,
        landM2: data.landM2 ? String(data.landM2) as unknown as number : null,
        developerName: data.developerName,
        developmentName: data.developmentName,
        slugAdjective: data.slugAdjective,
        neighborhood: data.neighborhood,
        latitude: data.latitude,
        longitude: data.longitude,
        rawData: {
          description: data.description,
          image: data.imageUrls,
          amenities: data.amenityLabels,
          source: "goodlers",
          brochureUrls: data.enrichment.brochureUrls,
          pricelistUrls: data.enrichment.pricelistUrls,
          pricelistImages: data.enrichment.pricelistImages,
          planUrls: data.enrichment.planUrls,
          progressImages: data.enrichment.progressImages,
          videoUrls: data.enrichment.videoUrls,
          websiteUrl: data.enrichment.websiteUrl,
        },
        contentHash: data.contentHash,
        lastCrawlRunId: data.crawlRunId,
        lastSeenAt: new Date(),
      },
    })
    .returning({ id: properties.id });

  if (!upserted) return;

  // Insert images
  for (let i = 0; i < data.imageUrls.length; i++) {
    await db
      .insert(propertyImages)
      .values({
        propertyId: upserted.id,
        position: i,
        originalUrl: data.imageUrls[i]!,
      })
      .onConflictDoUpdate({
        target: [propertyImages.propertyId, propertyImages.position],
        set: { originalUrl: data.imageUrls[i]! },
      });
  }
}

main().catch((err) => {
  logger.error({ error: String(err) }, "Goodlers crawl failed");
  process.exit(1);
});
