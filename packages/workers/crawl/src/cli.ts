#!/usr/bin/env node
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import {
  QUEUE_NAMES,
  type CrawlJobData,
  getRedisConnection,
  createLogger,
} from "@mpgenesis/shared";
import { createDb, sources, crawlRuns } from "@mpgenesis/database";

const logger = createLogger("crawl-cli");

async function main() {
  const domain = process.argv[2];
  const maxPages = process.argv[3] ? Number(process.argv[3]) : 100;

  if (!domain) {
    console.error("Usage: pnpm crawl <domain> [maxPages]");
    console.error("Example: pnpm crawl inmobiliariaplaya.com 50");
    process.exit(1);
  }

  const db = createDb();

  // Upsert source (P4: idempotency)
  const [source] = await db
    .insert(sources)
    .values({
      domain,
      name: domain,
      status: "active",
    })
    .onConflictDoUpdate({
      target: sources.domain,
      set: { status: "active" },
    })
    .returning();

  if (!source) {
    throw new Error("Failed to upsert source");
  }

  logger.info({ sourceId: source.id, domain }, "Source ready");

  // Create crawl run
  const crawlRunId = randomUUID();
  await db.insert(crawlRuns).values({
    id: crawlRunId,
    sourceId: source.id,
    status: "running",
  });

  logger.info({ crawlRunId, sourceId: source.id }, "Crawl run created");

  // Enqueue crawl job
  const queue = new Queue<CrawlJobData>(QUEUE_NAMES.CRAWL, {
    connection: getRedisConnection(),
  });

  await queue.add(QUEUE_NAMES.CRAWL, {
    sourceId: source.id,
    crawlRunId,
    domain,
    maxPages,
  });

  logger.info(
    { crawlRunId, domain, maxPages },
    "Crawl job queued. Start the crawl worker to process it.",
  );

  await queue.close();
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, "CLI error");
  process.exit(1);
});
