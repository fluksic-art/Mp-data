#!/usr/bin/env node
/** Direct crawl: fetch a listing index page, extract property URLs,
 * then crawl each property detail page.
 *
 * More reliable than generic discovery for the initial test.
 * Usage: tsx src/direct-crawl.ts <listing-index-url> [maxProperties]
 */
import { chromium } from "playwright";
import { Queue } from "bullmq";
import { randomUUID, createHash } from "node:crypto";
import {
  QUEUE_NAMES,
  type ExtractJobData,
  getRedisConnection,
  createLogger,
} from "@mpgenesis/shared";
import { createDb, sources, crawlRuns } from "@mpgenesis/database";

const logger = createLogger("direct-crawl");

async function main() {
  const listingUrl = process.argv[2];
  const maxProperties = process.argv[3] ? Number(process.argv[3]) : 20;

  if (!listingUrl) {
    console.error("Usage: tsx src/direct-crawl.ts <listing-url> [maxProperties]");
    console.error("Example: tsx src/direct-crawl.ts https://plalla.com/en/status/pre-construction/ 20");
    process.exit(1);
  }

  const domain = new URL(listingUrl).hostname;
  const db = createDb();

  // Upsert source (P4)
  const [source] = await db
    .insert(sources)
    .values({ domain, name: domain, status: "active" })
    .onConflictDoUpdate({ target: sources.domain, set: { status: "active" } })
    .returning();

  if (!source) throw new Error("Failed to upsert source");

  const crawlRunId = randomUUID();
  await db.insert(crawlRuns).values({
    id: crawlRunId,
    sourceId: source.id,
    status: "running",
  });

  logger.info({ sourceId: source.id, crawlRunId, listingUrl, maxProperties }, "Starting direct crawl");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    // Step 1: Get property URLs from the listing page(s)
    const propertyUrls = new Set<string>();
    let currentUrl: string | null = listingUrl;
    let pageNum = 0;

    while (currentUrl && propertyUrls.size < maxProperties) {
      pageNum++;
      logger.info({ url: currentUrl, pageNum }, "Fetching listing page");

      const page = await context.newPage();
      await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);

      // Extract /property/ links
      const links = await page.$$eval("a[href]", (anchors) =>
        anchors.map((a) => a.href),
      );

      for (const link of links) {
        if (/\/property\//.test(link) && propertyUrls.size < maxProperties) {
          propertyUrls.add(link);
        }
      }

      // Find next page link
      const nextPageUrl = await page.$eval(
        'a.next, a[rel="next"], a.pagination-next',
        (el) => (el as HTMLAnchorElement).href,
      ).catch(() => null);

      await page.close();

      if (nextPageUrl && propertyUrls.size < maxProperties) {
        currentUrl = nextPageUrl;
      } else {
        currentUrl = null;
      }
    }

    logger.info({ count: propertyUrls.size }, "Property URLs found");

    // Step 2: Crawl each property page
    const extractQueue = new Queue<ExtractJobData>(QUEUE_NAMES.EXTRACT, {
      connection: getRedisConnection(),
    });

    let crawled = 0;
    for (const url of propertyUrls) {
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(1500);

        const html = await page.content();
        await page.close();

        crawled++;
        logger.info({ url, crawled, total: propertyUrls.size }, "Crawled property");

        // Enqueue for extraction
        await extractQueue.add(QUEUE_NAMES.EXTRACT, {
          sourceId: source.id,
          crawlRunId,
          pageUrl: url,
          html,
        });
      } catch (err) {
        logger.error({ url, error: err instanceof Error ? err.message : String(err) }, "Failed to crawl property");
      }
    }

    await extractQueue.close();

    // Update crawl run
    await db
      .update(crawlRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
        pagesCrawled: crawled,
        listingsExtracted: crawled,
      })
      .where(
        (await import("drizzle-orm")).eq(crawlRuns.id, crawlRunId),
      );

    logger.info(
      { crawled, extractJobsQueued: crawled, crawlRunId },
      "Direct crawl complete!",
    );
  } finally {
    await browser.close();
  }

  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: err instanceof Error ? err.message : String(err) }, "Direct crawl failed");
  process.exit(1);
});
