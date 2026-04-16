#!/usr/bin/env node
/**
 * Ingest mayaocean.com via their sitemap + JSON-LD.
 *
 * Strategy: sitemap → parallel curl → cheerio + JSON-LD (Tier 1).
 * No Playwright, no proxy, no LLM during extraction.
 * Each /complex/{slug} page has a RealEstateListing JSON-LD with
 * name, address, offers (price, offerCount), provider, image.
 * The full description lives in div.cx-about-text (rich HTML, ~5000 chars).
 */
import { randomUUID, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import * as cheerio from "cheerio";
import { createLogger } from "@mpgenesis/shared";
import {
  createDb,
  sources,
  crawlRuns,
  properties,
  propertyImages,
} from "@mpgenesis/database";

const logger = createLogger("mayaocean-crawl");

const SITE_BASE = "https://mayaocean.com";
const SITEMAP_URL = `${SITE_BASE}/sitemaps/developments.xml`;
const CONCURRENCY = 10;

interface Extracted {
  slug: string;
  sourceUrl: string;
  name: string;
  description: string;
  streetAddress: string | null;
  city: string | null;
  developer: string | null;
  priceUsd: number | null;
  offerCount: number | null;
  distanceToSea: string | null;
  primaryImage: string | null;
  galleryImages: string[];
  amenities: string[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function normalizeForDedup(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugToRegex(slug: string): RegExp {
  // First 4+ letters of the slug; use as case-insensitive substring match on image filenames
  const firstWord = slug.split("-")[0] ?? slug;
  const stem = firstWord.length >= 4 ? firstWord : slug.replace(/-/g, "");
  return new RegExp(stem.slice(0, Math.max(4, stem.length)), "i");
}

async function fetchSlugs(): Promise<string[]> {
  const res = await fetch(SITEMAP_URL);
  if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status}`);
  const xml = await res.text();
  const slugs = Array.from(xml.matchAll(/<loc>https:\/\/mayaocean\.com\/complex\/([^<]+)<\/loc>/g))
    .map((m) => m[1]!)
    .filter(
      (s) =>
        !/^test-|-test(-|$)|-old(-|$)|^old-|staging|-copy(-|$)|^draft-|-draft(-|$)/i.test(s),
    );
  // Dedup
  return Array.from(new Set(slugs));
}

async function fetchAndExtract(slug: string): Promise<Extracted | null> {
  const sourceUrl = `${SITE_BASE}/complex/${slug}`;
  const res = await fetch(sourceUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    logger.warn({ slug, status: res.status }, "Fetch failed");
    return null;
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  // Find RealEstateListing JSON-LD block
  let listingLd: any = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text());
      if (j["@type"] === "RealEstateListing") listingLd = j;
    } catch {
      /* ignore parse errors */
    }
  });

  if (!listingLd) {
    logger.warn({ slug }, "No RealEstateListing JSON-LD found");
    return null;
  }

  const name: string = decodeEntities(listingLd.name ?? "").trim();
  if (!name) return null;

  const streetAddress: string | null = listingLd.address?.streetAddress
    ? decodeEntities(listingLd.address.streetAddress)
    : null;
  const city: string | null = listingLd.address?.addressLocality
    ? decodeEntities(listingLd.address.addressLocality)
    : null;

  const developer: string | null = listingLd.provider?.name
    ? decodeEntities(listingLd.provider.name)
    : null;

  const lowPrice = listingLd.offers?.lowPrice;
  const priceUsd = typeof lowPrice === "number" ? lowPrice : null;

  const offerCount =
    typeof listingLd.offers?.offerCount === "number" ? listingLd.offers.offerCount : null;

  // additionalProperty can be object or array
  let distanceToSea: string | null = null;
  const ap = listingLd.additionalProperty;
  const apArray = Array.isArray(ap) ? ap : ap ? [ap] : [];
  for (const p of apArray) {
    if (p?.name?.toLowerCase().includes("distance to sea")) {
      distanceToSea = decodeEntities(String(p.value));
    }
  }

  const primaryImage: string | null = listingLd.image ?? null;

  // Full description: rich HTML from div.cx-about-text
  const aboutHtml = $("div.cx-about-text").first().html() ?? "";
  const description = aboutHtml.trim() || (listingLd.description ?? "");

  // Gallery: probro.mx images whose filename matches the dev slug stem
  const stemRx = slugToRegex(slug);
  const allImgs = new Set<string>();
  $('img[src], source[srcset]').each((_, el) => {
    const src = $(el).attr("src") ?? $(el).attr("srcset")?.split(" ")[0];
    if (src) allImgs.add(src);
  });
  // Also scan raw HTML for probro.mx URLs (they show up in inline JSON/React data)
  const rawImgMatches = html.match(/https:\/\/probro\.mx\/wp-content\/uploads\/[^"'\s)]+\.(?:jpg|jpeg|png|webp)/gi) ?? [];
  for (const u of rawImgMatches) allImgs.add(u);

  const gallery: string[] = [];
  for (const u of allImgs) {
    if (!/probro\.mx/.test(u)) continue;
    const fname = u.split("/").pop() ?? "";
    if (stemRx.test(fname)) gallery.push(u);
  }
  // Include primary image from JSON-LD if not already in gallery
  if (primaryImage && !gallery.includes(primaryImage)) gallery.unshift(primaryImage);

  // Amenities: text in list under "Property Amenities" section
  const amenitySet = new Set<string>();
  // Cheap heuristic: find any element near "Property Amenities" and collect short text items
  const amenityHeader = $('h2, h3, h4').filter((_, el) =>
    /property amenities/i.test($(el).text()),
  ).first();
  if (amenityHeader.length) {
    amenityHeader
      .nextUntil('h2, h3, h4')
      .find('span, li, div')
      .each((_, el) => {
        const t = $(el).clone().children().remove().end().text().trim();
        if (t && t.length > 1 && t.length < 40 && !/^property amenities$/i.test(t)) {
          amenitySet.add(t);
        }
      });
  }

  return {
    slug,
    sourceUrl,
    name,
    description,
    streetAddress,
    city,
    developer,
    priceUsd,
    offerCount,
    distanceToSea,
    primaryImage,
    galleryImages: gallery,
    amenities: Array.from(amenitySet),
  };
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
  const onlyN = Number(process.env.MAYAOCEAN_LIMIT) || 0;
  const db = createDb();

  const [source] = await db
    .insert(sources)
    .values({
      domain: "mayaocean.com",
      name: "Maya Ocean Real Estate",
      status: "active",
    })
    .onConflictDoUpdate({ target: sources.domain, set: { status: "active" } })
    .returning();
  if (!source) throw new Error("Failed to upsert source");

  const crawlRunId = randomUUID();
  await db.insert(crawlRuns).values({
    id: crawlRunId,
    sourceId: source.id,
    status: "running",
  });

  let slugs = await fetchSlugs();
  if (onlyN > 0) slugs = slugs.slice(0, onlyN);
  logger.info({ sourceId: source.id, crawlRunId, slugs: slugs.length }, "Starting Maya Ocean crawl");

  // Load existing dev names for cross-source dedup
  const allOther = await db
    .select({
      developmentName: properties.developmentName,
      title: properties.title,
      sourceId: properties.sourceId,
    })
    .from(properties)
    .limit(10_000);
  const otherNormalized = new Set(
    allOther
      .filter((p) => p.sourceId !== source.id)
      .map((p) => normalizeForDedup(p.developmentName ?? p.title))
      .filter((s) => s.length >= 3),
  );

  let inserted = 0;
  let duplicates = 0;
  let skipped = 0;
  const errors: Array<{ slug: string; error: string }> = [];

  await runWithConcurrency(slugs, CONCURRENCY, async (slug) => {
    try {
      const ex = await fetchAndExtract(slug);
      if (!ex) {
        skipped++;
        return;
      }

      const devNormalized = normalizeForDedup(ex.name);
      const isDuplicate =
        devNormalized.length >= 3 &&
        Array.from(otherNormalized).some(
          (n) => n.includes(devNormalized) || devNormalized.includes(n),
        );

      if (isDuplicate) duplicates++;
      const status = isDuplicate ? "possible_duplicate" : "draft";

      const priceCents = ex.priceUsd ? Math.round(ex.priceUsd * 100) : null;
      const contentHash = createHash("sha256")
        .update(
          JSON.stringify({
            slug: ex.slug,
            name: ex.name,
            price: priceCents,
            units: ex.offerCount,
            devLen: ex.description.length,
          }),
        )
        .digest("hex");

      const rawData = {
        description: ex.description,
        image: ex.galleryImages,
        amenities: ex.amenities,
        source: "mayaocean",
        streetAddress: ex.streetAddress,
        distanceToSea: ex.distanceToSea,
        offerCount: ex.offerCount,
      };

      const [upserted] = await db
        .insert(properties)
        .values({
          sourceId: source.id,
          sourceListingId: ex.slug,
          sourceUrl: ex.sourceUrl,
          title: ex.name,
          propertyType: "apartment",
          listingType: "sale",
          priceCents,
          currency: "USD",
          bedrooms: null,
          bathrooms: null,
          constructionM2: null,
          landM2: null,
          developerName: ex.developer,
          developmentName: ex.name,
          country: "MX",
          state: "Quintana Roo",
          city: ex.city ?? "Quintana Roo",
          neighborhood: null,
          latitude: null,
          longitude: null,
          rawData,
          extractedData: { tier: 1, pageUrl: ex.sourceUrl },
          contentHash,
          lastCrawlRunId: crawlRunId,
          status,
        })
        .onConflictDoUpdate({
          target: [properties.sourceId, properties.sourceListingId],
          set: {
            title: ex.name,
            priceCents,
            developerName: ex.developer,
            developmentName: ex.name,
            city: ex.city ?? "Quintana Roo",
            rawData,
            contentHash,
            lastCrawlRunId: crawlRunId,
            lastSeenAt: new Date(),
          },
        })
        .returning({ id: properties.id });

      if (upserted) {
        for (let i = 0; i < ex.galleryImages.length; i++) {
          await db
            .insert(propertyImages)
            .values({
              propertyId: upserted.id,
              position: i,
              originalUrl: ex.galleryImages[i]!,
            })
            .onConflictDoUpdate({
              target: [propertyImages.propertyId, propertyImages.position],
              set: { originalUrl: ex.galleryImages[i]! },
            });
        }
      }

      inserted++;
      if (inserted % 25 === 0) {
        logger.info({ inserted, duplicates, skipped, total: slugs.length }, "Progress");
      }
    } catch (err) {
      const msg = String(err);
      logger.error({ slug, error: msg }, "Failed to process slug");
      errors.push({ slug, error: msg });
    }
  });

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
    { inserted, duplicates, skipped, errors: errors.length, crawlRunId },
    "Maya Ocean crawl complete",
  );
  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: String(err) }, "Maya Ocean crawl failed");
  process.exit(1);
});
