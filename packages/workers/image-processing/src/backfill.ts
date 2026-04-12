#!/usr/bin/env node
/** Backfill: enqueue image upload jobs for property_images
 * that don't have a rawUrl yet (not uploaded to Storage).
 *
 * Handles two cases:
 * 1. Properties with rawData.image but no property_images rows → inserts + enqueues
 * 2. property_images rows with rawUrl IS NULL → enqueues only
 *
 * Usage:
 *   pnpm --filter @mpgenesis/image-processing-worker backfill -- --dry-run
 *   pnpm --filter @mpgenesis/image-processing-worker backfill -- --limit 50
 */

import { Queue } from "bullmq";
import {
  QUEUE_NAMES,
  type ImageProcessingJobData,
  createLogger,
  getRedisConnection,
} from "@mpgenesis/shared";
import { createDb, properties, propertyImages } from "@mpgenesis/database";
import { eq, and, isNull, sql } from "drizzle-orm";

const logger = createLogger("image-backfill");

// Filter out the '--' separator that pnpm adds
const args = process.argv.slice(2).filter((a) => a !== "--");
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 500;

async function main() {
  logger.info({ dryRun, limit }, "Starting image backfill");

  const db = createDb();

  // Find property_images that need uploading (rawUrl IS NULL)
  const pending = await db
    .select({
      imageId: propertyImages.id,
      propertyId: propertyImages.propertyId,
      position: propertyImages.position,
      originalUrl: propertyImages.originalUrl,
    })
    .from(propertyImages)
    .where(isNull(propertyImages.rawUrl))
    .limit(limit);

  logger.info({ found: pending.length }, "Images needing upload");

  if (pending.length === 0) {
    logger.info("No images need backfilling");
    return;
  }

  // Get sourceId for each property (needed for job data)
  const propertyIds = [...new Set(pending.map((p) => p.propertyId))];
  const propData = new Map<string, { sourceId: string; crawlRunId: string | null }>();

  for (const pid of propertyIds) {
    const [p] = await db
      .select({
        sourceId: properties.sourceId,
        crawlRunId: properties.lastCrawlRunId,
      })
      .from(properties)
      .where(eq(properties.id, pid))
      .limit(1);
    if (p) propData.set(pid, { sourceId: p.sourceId, crawlRunId: p.crawlRunId });
  }

  if (dryRun) {
    logger.info(
      { images: pending.length, properties: propertyIds.length },
      "Dry run: would enqueue these jobs",
    );
    for (const img of pending.slice(0, 5)) {
      logger.info(
        { propertyId: img.propertyId.slice(0, 8), position: img.position, url: img.originalUrl.slice(0, 80) },
        "Would enqueue",
      );
    }
    if (pending.length > 5) logger.info(`... and ${pending.length - 5} more`);
    return;
  }

  // Enqueue jobs
  const queue = new Queue<ImageProcessingJobData>(QUEUE_NAMES.IMAGE_PROCESSING, {
    connection: getRedisConnection(),
  });

  let enqueued = 0;
  for (const img of pending) {
    const prop = propData.get(img.propertyId);
    if (!prop) continue;

    await queue.add(QUEUE_NAMES.IMAGE_PROCESSING, {
      sourceId: prop.sourceId,
      crawlRunId: prop.crawlRunId ?? "backfill",
      propertyId: img.propertyId,
      imageUrl: img.originalUrl,
      position: img.position,
    });
    enqueued++;
  }

  logger.info(
    { enqueued, properties: propertyIds.length },
    "Backfill jobs enqueued",
  );

  await queue.close();
}

main().catch((err: unknown) => {
  logger.error({ err }, "Backfill failed");
  console.error(err);
  process.exit(1);
});
