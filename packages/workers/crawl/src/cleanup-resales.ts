#!/usr/bin/env node
/** Delete resale properties (/propiedad/) from propiedadescancun.mx. */
import { createDb, properties, propertyImages, sources } from "@mpgenesis/database";
import { eq, and, like, inArray } from "drizzle-orm";
import { createLogger } from "@mpgenesis/shared";

const logger = createLogger("cleanup-resales");

async function main() {
  const db = createDb();

  const [source] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.domain, "propiedadescancun.mx"))
    .limit(1);

  if (!source) {
    logger.info("Source not found");
    process.exit(0);
  }

  // Find resale properties (URL contains /propiedad/)
  const resales = await db
    .select({ id: properties.id, sourceUrl: properties.sourceUrl })
    .from(properties)
    .where(
      and(
        eq(properties.sourceId, source.id),
        like(properties.sourceUrl, "%/propiedad/%"),
      ),
    );

  logger.info({ count: resales.length }, "Resales to delete");

  if (resales.length === 0) {
    logger.info("Nothing to delete");
    process.exit(0);
  }

  const ids = resales.map((r) => r.id);

  // Delete images first (FK constraint)
  await db.delete(propertyImages).where(inArray(propertyImages.propertyId, ids));
  logger.info("Images deleted");

  // Delete properties
  await db.delete(properties).where(inArray(properties.id, ids));
  logger.info({ deleted: ids.length }, "Resale properties deleted");

  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: String(err) }, "Cleanup failed");
  process.exit(1);
});
