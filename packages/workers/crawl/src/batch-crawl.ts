#!/usr/bin/env node
/**
 * Batch crawl: fetch all pending plalla.com listings in batches with stealth.
 *
 * 1. Fetches sitemap XML → extracts /propiedad/ URLs
 * 2. Filters out already-crawled URLs (DB lookup)
 * 3. Crawls in batches of N with proxy + resource blocking + random delays
 * 4. Enqueues extract jobs to BullMQ after each page
 * 5. Waits between batches to avoid detection
 *
 * Usage: tsx src/batch-crawl.ts [batchSize] [gapMinutes] [concurrency]
 * Defaults: batchSize=100, gapMinutes=30, concurrency=3
 */
import { chromium } from "playwright";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  QUEUE_NAMES,
  type ExtractJobData,
  getRedisConnection,
  createLogger,
} from "@mpgenesis/shared";
import { createDb, sources, crawlRuns, properties } from "@mpgenesis/database";
import { getPlaywrightProxy } from "./proxy-config.js";
import { blockResources } from "./resource-blocker.js";
import { randomDelay, randomUserAgent } from "./stealth.js";

const logger = createLogger("batch-crawl");

// ---------------------------------------------------------------------------
// Bandwidth tracking
// ---------------------------------------------------------------------------
interface BandwidthStats {
  totalBytes: number;
  requestCount: number;
  /** Hard limit in bytes — abort crawl if exceeded */
  limitBytes: number;
  /** Warn threshold in bytes — log alert when crossed */
  warnBytes: number;
}

function createBandwidthTracker(limitMB: number): BandwidthStats {
  return {
    totalBytes: 0,
    requestCount: 0,
    limitBytes: limitMB * 1024 * 1024,
    warnBytes: limitMB * 0.8 * 1024 * 1024, // warn at 80%
  };
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function checkBandwidth(stats: BandwidthStats): "ok" | "warn" | "exceeded" {
  if (stats.totalBytes >= stats.limitBytes) return "exceeded";
  if (stats.totalBytes >= stats.warnBytes) return "warn";
  return "ok";
}

// ---------------------------------------------------------------------------
// Sitemap fetching (plain HTTP, no browser needed)
// ---------------------------------------------------------------------------
async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  const allUrls: string[] = [];
  const visited = new Set<string>();

  async function fetchOne(url: string) {
    if (visited.has(url)) return;
    visited.add(url);

    logger.info({ url }, "Fetching sitemap");
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ url, status: res.status }, "Sitemap fetch failed");
      return;
    }
    const xml = await res.text();

    const locRegex = /<loc>(.*?)<\/loc>/g;
    const urls: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(xml)) !== null) {
      if (match[1]) urls.push(match[1]);
    }

    // Separate sub-sitemaps from page URLs
    const subSitemaps = urls.filter((u) => /sitemap.*\.xml/i.test(u));
    const pageUrls = urls.filter((u) => !/sitemap.*\.xml/i.test(u));

    allUrls.push(...pageUrls);

    for (const sub of subSitemaps) {
      await fetchOne(sub);
    }
  }

  await fetchOne(`${baseUrl}/sitemap.xml`);
  // Also try wp-sitemap as fallback
  await fetchOne(`${baseUrl}/wp-sitemap.xml`);

  return allUrls;
}

/**
 * Extract a base slug for dedup. Strips locale prefixes and suffixes.
 * /en/property/honey-b-residences-en/  → honey-b-residences
 * /propiedad/honey-b-residences/       → honey-b-residences
 * /fr/propriete/honey-b-residences-fr/ → honey-b-residences
 */
function extractBaseSlug(url: string): string {
  const parts = url.replace(/\/+$/, "").split("/");
  let slug = parts.pop() ?? "";
  // Remove locale suffixes: -en, -fr, -fr-2, -en-2
  slug = slug.replace(/-(en|fr)(-\d+)?$/, "");
  return slug.toLowerCase();
}

/** Filter to ES property detail pages, or convert EN/FR slugs to ES. */
function filterPropertyUrls(urls: string[], baseUrl: string): string[] {
  const esUrls = new Set<string>();

  for (const url of urls) {
    // Direct ES match
    if (url.includes("/propiedad/")) {
      esUrls.add(url);
      continue;
    }
    // Convert EN /property/ or FR /propriete/ to ES /propiedad/
    if (url.includes("/property/") || url.includes("/propriete/")) {
      const slug = url.split("/").pop();
      if (slug) {
        esUrls.add(`${baseUrl}/propiedad/${slug}`);
      }
    }
  }

  return [...esUrls];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const batchSize = process.argv[2] ? Number(process.argv[2]) : 100;
  const gapMinutes = process.argv[3] ? Number(process.argv[3]) : 30;
  const concurrency = process.argv[4] ? Number(process.argv[4]) : 3;
  const domain = "plalla.com";
  const baseUrl = `https://${domain}`;

  // Measured: ~1.5MB per page with resource blocking (HTML has heavy inline JS)
  // For ~473 pages ≈ 710MB. Set hard limit at 2GB as safety net.
  const BANDWIDTH_LIMIT_MB = 2048;
  const bandwidth = createBandwidthTracker(BANDWIDTH_LIMIT_MB);

  const db = createDb();

  // Upsert source (P4)
  const [source] = await db
    .insert(sources)
    .values({ domain, name: domain, status: "active" })
    .onConflictDoUpdate({ target: sources.domain, set: { status: "active" } })
    .returning();

  if (!source) throw new Error("Failed to upsert source");
  logger.info({ sourceId: source.id }, "Source ready");

  // Step 1: Fetch sitemap URLs
  logger.info("Fetching sitemaps...");
  const allSitemapUrls = await fetchSitemapUrls(baseUrl);
  logger.info({ total: allSitemapUrls.length }, "Total URLs from sitemaps");

  const propertyUrls = filterPropertyUrls(allSitemapUrls, baseUrl);
  logger.info({ count: propertyUrls.length }, "Property URLs after filtering");

  // Step 2: Get already-crawled URLs
  // DB stores EN URLs (/en/property/slug-en/) but sitemap has ES (/propiedad/slug/).
  // Normalize both to a base slug for comparison.
  const crawledRows = await db
    .select({ sourceUrl: properties.sourceUrl })
    .from(properties)
    .where(eq(properties.sourceId, source.id));

  const alreadyCrawledSlugs = new Set(
    crawledRows.map((r) => extractBaseSlug(r.sourceUrl)),
  );
  const remaining = propertyUrls.filter(
    (u) => !alreadyCrawledSlugs.has(extractBaseSlug(u)),
  );

  logger.info(
    {
      alreadyCrawled: alreadyCrawledSlugs.size,
      remaining: remaining.length,
      total: propertyUrls.length,
    },
    "URL dedup complete",
  );

  if (remaining.length === 0) {
    logger.info("No pending URLs. Done.");
    process.exit(0);
  }

  // Step 3: Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < remaining.length; i += batchSize) {
    batches.push(remaining.slice(i, i + batchSize));
  }

  logger.info(
    { batches: batches.length, batchSize, gapMinutes, concurrency },
    `Starting ${batches.length} batches (${concurrency} concurrent)`,
  );

  // Verify proxy is configured
  const proxy = getPlaywrightProxy();
  if (!proxy) {
    logger.error("PROXY_HOST/PROXY_USER/PROXY_PASS env vars not set. Aborting.");
    process.exit(1);
  }

  const extractQueue = new Queue<ExtractJobData>(QUEUE_NAMES.EXTRACT, {
    connection: getRedisConnection(),
  });

  // Step 4: Process batches
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]!;
    const crawlRunId = randomUUID();

    await db.insert(crawlRuns).values({
      id: crawlRunId,
      sourceId: source.id,
      status: "running",
    });

    logger.info(
      { batch: b + 1, total: batches.length, urls: batch.length, crawlRunId },
      `Starting batch ${b + 1}/${batches.length}`,
    );

    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const context = await browser.newContext({
      proxy,
      userAgent: randomUserAgent(),
    });

    let crawled = 0;
    const batchErrors: Array<{ url: string; error: string }> = [];
    const batchStartBytes = bandwidth.totalBytes;
    let bandwidthExceeded = false;

    // Process URLs in concurrent chunks
    // Each chunk of `concurrency` URLs runs in parallel — each gets its own
    // proxy IP (DataImpulse rotates per-request), so no ban risk.
    for (let i = 0; i < batch.length && !bandwidthExceeded; i += concurrency) {
      const chunk = batch.slice(i, i + concurrency);

      const results = await Promise.allSettled(
        chunk.map(async (url) => {
          const page = await context.newPage();
          await blockResources(page);

          // Track response sizes for bandwidth monitoring
          page.on("response", (response) => {
            const headers = response.headers();
            const contentLength = headers["content-length"];
            if (contentLength) {
              bandwidth.totalBytes += Number(contentLength);
              bandwidth.requestCount++;
            }
          });

          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

          const html = await page.content();
          bandwidth.totalBytes += Buffer.byteLength(html, "utf-8");

          await page.close();

          // Enqueue for extraction
          await extractQueue.add(QUEUE_NAMES.EXTRACT, {
            sourceId: source.id,
            crawlRunId,
            pageUrl: url,
            html,
          });

          return url;
        }),
      );

      // Tally results
      for (let j = 0; j < results.length; j++) {
        const result = results[j]!;
        if (result.status === "fulfilled") {
          crawled++;
        } else {
          const errorMsg =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          batchErrors.push({ url: chunk[j]!, error: errorMsg });
          logger.error({ url: chunk[j], error: errorMsg }, "Failed to crawl page");
        }
      }

      // Log progress every chunk
      const batchBytes = bandwidth.totalBytes - batchStartBytes;
      logger.info(
        {
          batch: b + 1,
          crawled,
          total: batch.length,
          batchMB: formatMB(batchBytes),
          totalMB: formatMB(bandwidth.totalBytes),
          avgKBPerPage: crawled > 0 ? (batchBytes / crawled / 1024).toFixed(1) : "0",
        },
        `Batch ${b + 1} progress: ${crawled}/${batch.length}`,
      );

      // Bandwidth checks
      const bwStatus = checkBandwidth(bandwidth);
      if (bwStatus === "exceeded") {
        logger.error(
          {
            totalMB: formatMB(bandwidth.totalBytes),
            limitMB: BANDWIDTH_LIMIT_MB,
            requests: bandwidth.requestCount,
          },
          "BANDWIDTH LIMIT EXCEEDED — stopping crawl to prevent cost overrun",
        );
        bandwidthExceeded = true;
        break;
      }
      if (bwStatus === "warn") {
        logger.warn(
          {
            totalMB: formatMB(bandwidth.totalBytes),
            limitMB: BANDWIDTH_LIMIT_MB,
            pctUsed: ((bandwidth.totalBytes / bandwidth.limitBytes) * 100).toFixed(1),
          },
          "BANDWIDTH WARNING: approaching limit",
        );
      }

      // Delay between chunks (not between individual pages — they run in parallel)
      if (i + concurrency < batch.length) {
        await randomDelay();
      }
    }

    if (bandwidthExceeded) {
      await browser.close();
      await db
        .update(crawlRuns)
        .set({
          status: "failed",
          completedAt: new Date(),
          pagesCrawled: crawled,
          errors: [{ url: "bandwidth", error: `Exceeded ${BANDWIDTH_LIMIT_MB}MB limit` }],
        })
        .where(eq(crawlRuns.id, crawlRunId));
      await extractQueue.close();
      process.exit(1);
    }

    await browser.close();

    // Update crawl run
    const batchBytes = bandwidth.totalBytes - batchStartBytes;
    await db
      .update(crawlRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
        pagesCrawled: crawled,
        listingsExtracted: crawled,
        errors: batchErrors.length > 0 ? batchErrors : undefined,
      })
      .where(eq(crawlRuns.id, crawlRunId));

    logger.info(
      {
        batch: b + 1,
        crawled,
        errors: batchErrors.length,
        batchMB: formatMB(batchBytes),
        totalMB: formatMB(bandwidth.totalBytes),
      },
      `Batch ${b + 1} complete`,
    );

    // Wait between batches (unless it's the last one)
    if (b < batches.length - 1) {
      const gapMs = gapMinutes * 60 * 1000;
      logger.info(
        { gapMinutes, nextBatch: b + 2, totalBatches: batches.length },
        `Waiting ${gapMinutes} minutes before next batch...`,
      );
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
  }

  await extractQueue.close();

  // Final bandwidth summary
  logger.info(
    {
      totalPages: remaining.length,
      totalMB: formatMB(bandwidth.totalBytes),
      totalRequests: bandwidth.requestCount,
      avgKBPerPage: (bandwidth.totalBytes / remaining.length / 1024).toFixed(1),
      estimatedCostUSD: (bandwidth.totalBytes / (1024 * 1024 * 1024)).toFixed(2),
    },
    "CRAWL COMPLETE — bandwidth summary",
  );

  process.exit(0);
}

main().catch((err) => {
  logger.error(
    { error: err instanceof Error ? err.message : String(err) },
    "Batch crawl failed",
  );
  process.exit(1);
});
