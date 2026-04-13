#!/usr/bin/env node
/**
 * Targeted crawl for luumorealestate.com.
 * Discovers property URLs from multiple listing pages, then crawls each.
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
import { createDb, sources, crawlRuns } from "@mpgenesis/database";
import { getPlaywrightProxy } from "./proxy-config.js";
import { blockResources } from "./resource-blocker.js";
import { randomDelay, randomUserAgent } from "./stealth.js";

const logger = createLogger("luumo-crawl");

const LISTING_PAGES = [
  "https://www.luumorealestate.com/desarrollos-inmobiliarios/",
  "https://www.luumorealestate.com/casas/",
  "https://www.luumorealestate.com/terrenos/",
  "https://www.luumorealestate.com/departamentos/",
  "https://www.luumorealestate.com/terrenos-en-venta-en-merida/",
  "https://www.luumorealestate.com/desarrollos-inmobiliarios-en-yucatan/",
  "https://www.luumorealestate.com/desarrollos-inmobiliarios-en-izamal/",
];

async function main() {
  const maxProperties = process.argv[2] ? Number(process.argv[2]) : 20;
  const domain = "www.luumorealestate.com";
  const db = createDb();

  // Upsert source
  const [source] = await db
    .insert(sources)
    .values({ domain, name: "Luumo Real Estate", status: "active" })
    .onConflictDoUpdate({ target: sources.domain, set: { status: "active" } })
    .returning();
  if (!source) throw new Error("Failed to upsert source");

  const crawlRunId = randomUUID();
  await db.insert(crawlRuns).values({
    id: crawlRunId,
    sourceId: source.id,
    status: "running",
  });

  logger.info({ sourceId: source.id, crawlRunId, maxProperties }, "Starting Luumo crawl");

  const proxy = getPlaywrightProxy();
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    ...(proxy ? { proxy } : {}),
    userAgent: randomUserAgent(),
  });

  // Step 1: Discover property URLs from all listing pages
  const propertyUrls = new Set<string>();

  for (const listingUrl of LISTING_PAGES) {
    if (propertyUrls.size >= maxProperties) break;

    try {
      const page = await context.newPage();
      await blockResources(page);
      await page.goto(listingUrl, { waitUntil: "networkidle", timeout: 30000 });

      // Scroll to load all content
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(800);
      }

      const links = await page.evaluate(() => {
        const anchors = document.querySelectorAll("a[href]");
        const urls: string[] = [];
        for (const a of anchors) {
          const href = (a as HTMLAnchorElement).href;
          if (
            href.includes("/desarrollos/") &&
            !href.endsWith("/desarrollos/")
          ) {
            urls.push(href);
          }
        }
        return [...new Set(urls)];
      });

      for (const link of links) {
        if (propertyUrls.size < maxProperties) propertyUrls.add(link);
      }

      logger.info({ listingUrl, found: links.length, total: propertyUrls.size }, "Scanned listing page");
      await page.close();
      await randomDelay();
    } catch (err) {
      logger.error({ listingUrl, error: String(err) }, "Failed to scan listing page");
    }
  }

  logger.info({ count: propertyUrls.size }, "Property URLs discovered");

  // Step 2: Crawl each property page
  const extractQueue = new Queue<ExtractJobData>(QUEUE_NAMES.EXTRACT, {
    connection: getRedisConnection(),
  });

  let crawled = 0;
  for (const url of propertyUrls) {
    try {
      const page = await context.newPage();
      await blockResources(page);
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

      const html = await page.content();
      await page.close();
      crawled++;

      await extractQueue.add(QUEUE_NAMES.EXTRACT, {
        sourceId: source.id,
        crawlRunId,
        pageUrl: url,
        html,
      });

      logger.info({ url, crawled, total: propertyUrls.size }, "Crawled property");
      await randomDelay();
    } catch (err) {
      logger.error({ url, error: String(err) }, "Failed to crawl property");
    }
  }

  await browser.close();
  await extractQueue.close();

  await db
    .update(crawlRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      pagesCrawled: crawled,
      listingsExtracted: crawled,
    })
    .where(eq(crawlRuns.id, crawlRunId));

  logger.info({ crawled, total: propertyUrls.size, crawlRunId }, "Luumo crawl complete");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: String(err) }, "Luumo crawl failed");
  process.exit(1);
});
