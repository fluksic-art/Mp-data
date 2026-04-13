#!/usr/bin/env node
/**
 * Targeted crawl for novalproperties.com.
 * SPA site — needs full JS rendering + scroll.
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

const logger = createLogger("noval-crawl");

async function main() {
  const maxProperties = process.argv[2] ? Number(process.argv[2]) : 20;
  const domain = "novalproperties.com";
  const db = createDb();

  const [source] = await db
    .insert(sources)
    .values({ domain, name: "Noval Properties", status: "active" })
    .onConflictDoUpdate({ target: sources.domain, set: { status: "active" } })
    .returning();
  if (!source) throw new Error("Failed to upsert source");

  const crawlRunId = randomUUID();
  await db.insert(crawlRuns).values({
    id: crawlRunId,
    sourceId: source.id,
    status: "running",
  });

  logger.info({ sourceId: source.id, crawlRunId, maxProperties }, "Starting Noval crawl");

  const proxy = getPlaywrightProxy();
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    ...(proxy ? { proxy } : {}),
    userAgent: randomUserAgent(),
  });

  // Step 1: Discover property URLs
  const propertyUrls = new Set<string>();
  const page = await context.newPage();
  await page.goto("https://novalproperties.com/proyectos", {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
  }

  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll("a[href]");
    const urls: string[] = [];
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      if (
        href.includes("/proyectos/") &&
        !href.endsWith("/proyectos") &&
        !href.endsWith("/proyectos/")
      ) {
        urls.push(href);
      }
    }
    return [...new Set(urls)];
  });

  for (const link of links) {
    if (propertyUrls.size < maxProperties) propertyUrls.add(link);
  }
  await page.close();

  logger.info({ count: propertyUrls.size }, "Property URLs discovered");

  // Step 2: Crawl each property
  const extractQueue = new Queue<ExtractJobData>(QUEUE_NAMES.EXTRACT, {
    connection: getRedisConnection(),
  });

  let crawled = 0;
  for (const url of propertyUrls) {
    try {
      const p = await context.newPage();
      await p.goto(url, { waitUntil: "networkidle", timeout: 30000 });

      // SPA: wait for content to render
      await p.waitForTimeout(2000);
      const html = await p.content();
      await p.close();
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

  logger.info({ crawled, total: propertyUrls.size, crawlRunId }, "Noval crawl complete");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: String(err) }, "Noval crawl failed");
  process.exit(1);
});
