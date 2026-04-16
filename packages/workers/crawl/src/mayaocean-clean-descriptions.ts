#!/usr/bin/env node
/**
 * One-shot backfill: re-clean description text for mayaocean.com listings
 * that were stored before cleanMayaoceanDescription existed.
 *
 * The crawler now cleans descriptions at extraction time, but existing rows
 * contain the raw double-escaped HTML (e.g. "&lt;strong&gt;..."). This script
 * runs the same cleaner on the stored string and updates raw_data.description
 * in place. No re-fetch needed — the stored value is the serialized inner HTML
 * from cheerio, which the cleaner can reprocess deterministically.
 */
import { eq } from "drizzle-orm";
import { createLogger } from "@mpgenesis/shared";
import { createDb, properties, sources } from "@mpgenesis/database";
import { cleanMayaoceanDescription } from "./mayaocean-crawl.js";

const logger = createLogger("mayaocean-clean-descriptions");

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const db = createDb();

  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.domain, "mayaocean.com"));
  if (!source) throw new Error("mayaocean.com source not found");

  const rows = await db
    .select({
      id: properties.id,
      slug: properties.sourceListingId,
      rawData: properties.rawData,
    })
    .from(properties)
    .where(eq(properties.sourceId, source.id));

  logger.info({ total: rows.length, dryRun }, "Starting description cleanup");

  let updated = 0;
  let unchanged = 0;
  let empty = 0;

  for (const r of rows) {
    const rawData = (r.rawData ?? {}) as Record<string, unknown>;
    const current = (rawData["description"] as string | undefined) ?? "";
    if (!current) {
      empty++;
      continue;
    }
    const cleaned = cleanMayaoceanDescription(current);
    if (cleaned === current) {
      unchanged++;
      continue;
    }

    if (dryRun) {
      logger.info(
        {
          slug: r.slug,
          beforeLen: current.length,
          afterLen: cleaned.length,
          preview: cleaned.slice(0, 120),
        },
        "Would update",
      );
      updated++;
      continue;
    }

    await db
      .update(properties)
      .set({ rawData: { ...rawData, description: cleaned } })
      .where(eq(properties.id, r.id));
    updated++;
    if (updated % 25 === 0) {
      logger.info({ updated, unchanged, empty, total: rows.length }, "Progress");
    }
  }

  logger.info({ updated, unchanged, empty, total: rows.length }, "Cleanup complete");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: String(err) }, "Description cleanup failed");
  process.exit(1);
});
