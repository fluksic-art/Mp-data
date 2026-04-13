#!/usr/bin/env node
/**
 * Download and extract text from goodlers.com brochure and pricelist PDFs.
 *
 * Reads brochureUrls/pricelistUrls from rawData, downloads each PDF,
 * extracts text with pdf-parse, and saves back to rawData as
 * brochureText/pricelistText.
 *
 * Idempotent: skips listings that already have extracted text.
 * Cost: $0 (no LLM, just HTTP + PDF parsing).
 */
// @ts-ignore — pdf-parse v1 has no types
import pdf from "pdf-parse/lib/pdf-parse.js";
import { eq, and, sql } from "drizzle-orm";
import {
  createLogger,
} from "@mpgenesis/shared";
import {
  createDb,
  sources,
  properties,
} from "@mpgenesis/database";

const logger = createLogger("goodlers-pdf-extract");

/** Download a PDF and extract its text content. */
async function extractTextFromPdf(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, "PDF download failed");
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const result = await pdf(buffer);

    // Clean up extracted text
    const text = result.text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    if (text.length < 10) {
      logger.warn({ url, textLen: text.length }, "PDF has very little text (likely image-based)");
      return null;
    }

    return text;
  } catch (err) {
    logger.error({ url, error: String(err) }, "PDF extraction failed");
    return null;
  }
}

async function main() {
  const db = createDb();

  // Get goodlers source
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.domain, "goodlers.com"));
  if (!source) {
    logger.error("No goodlers.com source found");
    process.exit(1);
  }

  // Get all goodlers listings that have brochure/pricelist URLs
  const listings = await db
    .select({
      id: properties.id,
      title: properties.title,
      developmentName: properties.developmentName,
      rawData: properties.rawData,
    })
    .from(properties)
    .where(eq(properties.sourceId, source.id));

  logger.info({ total: listings.length }, "Goodlers listings loaded");

  let processed = 0;
  let brochuresExtracted = 0;
  let pricelistsExtracted = 0;
  let skipped = 0;
  let failed = 0;

  // Track which development brochures we've already processed
  // (all models of the same development share the same brochure)
  const processedBrochures = new Map<string, string | null>();
  const processedPricelists = new Map<string, string | null>();

  for (const listing of listings) {
    const raw = listing.rawData as Record<string, unknown>;
    const brochureUrls = (raw?.brochureUrls as string[]) ?? [];
    const pricelistUrls = (raw?.pricelistUrls as string[]) ?? [];

    // Skip if no PDFs available
    if (brochureUrls.length === 0 && pricelistUrls.length === 0) {
      skipped++;
      continue;
    }

    // Skip if already extracted
    if (raw?.brochureText || raw?.pricelistText) {
      skipped++;
      continue;
    }

    const devName = listing.developmentName ?? listing.title;
    let brochureText: string | null = null;
    let pricelistText: string | null = null;

    // Extract brochure text (deduplicate by URL across models)
    if (brochureUrls.length > 0) {
      const url = brochureUrls[0]!;
      if (processedBrochures.has(url)) {
        brochureText = processedBrochures.get(url) ?? null;
      } else {
        logger.info({ dev: devName, url: url.split("/").pop() }, "Extracting brochure");
        brochureText = await extractTextFromPdf(url);
        processedBrochures.set(url, brochureText);
        if (brochureText) brochuresExtracted++;
      }
    }

    // Extract pricelist text (deduplicate by URL across models)
    if (pricelistUrls.length > 0) {
      const url = pricelistUrls[0]!;
      if (processedPricelists.has(url)) {
        pricelistText = processedPricelists.get(url) ?? null;
      } else {
        logger.info({ dev: devName, url: url.split("/").pop() }, "Extracting pricelist");
        pricelistText = await extractTextFromPdf(url);
        processedPricelists.set(url, pricelistText);
        if (pricelistText) pricelistsExtracted++;
      }
    }

    // Update rawData with extracted text
    if (brochureText || pricelistText) {
      const updatedRaw = {
        ...raw,
        ...(brochureText ? { brochureText } : {}),
        ...(pricelistText ? { pricelistText } : {}),
      };

      await db
        .update(properties)
        .set({ rawData: updatedRaw })
        .where(eq(properties.id, listing.id));

      processed++;
    } else {
      failed++;
    }

    if ((processed + failed) % 20 === 0 && (processed + failed) > 0) {
      logger.info(
        { processed, brochuresExtracted, pricelistsExtracted, skipped, failed },
        "Progress",
      );
    }
  }

  logger.info(
    {
      totalListings: listings.length,
      processed,
      brochuresExtracted,
      pricelistsExtracted,
      skipped,
      failed,
      uniqueBrochures: processedBrochures.size,
      uniquePricelists: processedPricelists.size,
    },
    "PDF extraction complete",
  );
  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: String(err) }, "PDF extraction failed");
  process.exit(1);
});
