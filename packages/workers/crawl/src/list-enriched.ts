#!/usr/bin/env node
import { createDb, properties, sources } from "@mpgenesis/database";
import { eq, and, sql } from "drizzle-orm";

async function main() {
  const db = createDb();
  const [src] = await db.select().from(sources).where(eq(sources.domain, "goodlers.com"));
  if (!src) { console.log("No source"); process.exit(0); }

  const listings = await db.select({
    title: properties.title,
    developmentName: properties.developmentName,
    city: properties.city,
    neighborhood: properties.neighborhood,
    sourceUrl: properties.sourceUrl,
    rawData: properties.rawData,
  })
  .from(properties)
  .where(and(
    eq(properties.sourceId, src.id),
    sql`raw_data->>'brochureText' IS NOT NULL`,
    sql`raw_data->>'pricelistText' IS NOT NULL`,
  ))
  .limit(15);

  console.log(`=== ${listings.length} listings with BOTH brochure + pricelist text ===\n`);

  for (const l of listings) {
    const raw = l.rawData as Record<string, unknown>;
    const brochureLen = (raw.brochureText as string ?? "").length;
    const pricelistLen = (raw.pricelistText as string ?? "").length;
    const brochureSample = (raw.brochureText as string ?? "").substring(0, 200).replace(/\n+/g, " ");

    console.log(`📍 ${l.developmentName} — ${l.title}`);
    console.log(`   ${l.neighborhood}, ${l.city}`);
    console.log(`   Brochure: ${brochureLen} chars | Pricelist: ${pricelistLen} chars`);
    console.log(`   URL: ${l.sourceUrl}`);
    console.log(`   Sample: ${brochureSample}...`);
    console.log();
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
