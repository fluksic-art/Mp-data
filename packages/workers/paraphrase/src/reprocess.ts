#!/usr/bin/env node
/** Re-process: clear existing translations + re-enqueue paraphrase for all properties.
 *
 * Use this after upgrading the paraphrase prompt / output schema so the
 * existing inventory is regenerated under the new format. Detects whether
 * a property is already on the new structured format (contentVersion === 2)
 * and skips it unless --force is passed.
 *
 * Usage:
 *   pnpm --filter @mpgenesis/paraphrase-worker exec tsx src/reprocess.ts
 *   pnpm --filter @mpgenesis/paraphrase-worker exec tsx src/reprocess.ts --force
 */
import { Queue } from "bullmq";
import {
  QUEUE_NAMES,
  type ParaphraseJobData,
  getRedisConnection,
  createLogger,
  isStructuredContent,
} from "@mpgenesis/shared";
import { createDb, properties } from "@mpgenesis/database";
import { eq } from "drizzle-orm";

const logger = createLogger("paraphrase-reprocess");

async function main() {
  const force = process.argv.includes("--force");
  const db = createDb();

  const all = await db
    .select({
      id: properties.id,
      sourceId: properties.sourceId,
      lastCrawlRunId: properties.lastCrawlRunId,
      rawData: properties.rawData,
      contentEs: properties.contentEs,
      title: properties.title,
    })
    .from(properties);

  if (all.length === 0) {
    logger.info("No properties in DB");
    process.exit(0);
  }

  const queue = new Queue<ParaphraseJobData>(QUEUE_NAMES.PARAPHRASE, {
    connection: getRedisConnection(),
  });

  let queued = 0;
  let skipped = 0;
  let noDesc = 0;
  let cleared = 0;

  for (const prop of all) {
    if (!force && isStructuredContent(prop.contentEs)) {
      skipped++;
      continue;
    }

    const rawData = prop.rawData as Record<string, unknown>;
    const description = (rawData["description"] as string) ?? "";
    if (!description || description.length < 20) {
      noDesc++;
      continue;
    }

    // Clear all locale content + reset status, so the page renderer falls
    // back to the template until the new structured content lands.
    await db
      .update(properties)
      .set({
        contentEs: null,
        contentEn: null,
        contentFr: null,
        status: "draft",
      })
      .where(eq(properties.id, prop.id));
    cleared++;

    await queue.add(QUEUE_NAMES.PARAPHRASE, {
      sourceId: prop.sourceId,
      crawlRunId: prop.lastCrawlRunId ?? "",
      propertyId: prop.id,
      description,
    });
    queued++;
  }

  await queue.close();
  logger.info(
    { total: all.length, queued, cleared, skippedAlreadyV2: skipped, noDesc },
    "Reprocess complete (jobs queued; workers must be running)",
  );
  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: err }, "Reprocess failed");
  process.exit(1);
});
