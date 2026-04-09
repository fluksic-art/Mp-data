#!/usr/bin/env node
/** Enqueue paraphrase jobs for all properties that don't have content_es yet */
import { Queue } from "bullmq";
import {
  QUEUE_NAMES,
  type ParaphraseJobData,
  getRedisConnection,
  createLogger,
} from "@mpgenesis/shared";
import { createDb, properties } from "@mpgenesis/database";
import { isNull } from "drizzle-orm";

const logger = createLogger("paraphrase-enqueue");

async function main() {
  const db = createDb();

  // Find properties without paraphrased content
  const pending = await db
    .select({
      id: properties.id,
      sourceId: properties.sourceId,
      lastCrawlRunId: properties.lastCrawlRunId,
      rawData: properties.rawData,
    })
    .from(properties)
    .where(isNull(properties.contentEs));

  if (pending.length === 0) {
    logger.info("No properties need paraphrasing");
    process.exit(0);
  }

  const queue = new Queue<ParaphraseJobData>(QUEUE_NAMES.PARAPHRASE, {
    connection: getRedisConnection(),
  });

  let queued = 0;
  for (const prop of pending) {
    const rawData = prop.rawData as Record<string, unknown>;
    const description = (rawData["description"] as string) ?? "";

    if (!description || description.length < 20) {
      logger.warn({ propertyId: prop.id }, "No description, skipping");
      continue;
    }

    await queue.add(QUEUE_NAMES.PARAPHRASE, {
      sourceId: prop.sourceId,
      crawlRunId: prop.lastCrawlRunId ?? "",
      propertyId: prop.id,
      description,
    });
    queued++;
  }

  await queue.close();
  logger.info({ queued, total: pending.length }, "Paraphrase jobs enqueued");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: err }, "Enqueue failed");
  process.exit(1);
});
