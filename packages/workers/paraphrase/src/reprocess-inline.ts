#!/usr/bin/env node
/** Inline reprocess: paraphrase + translate (EN, FR) for every property
 * that is not yet on contentVersion 2, WITHOUT going through BullMQ.
 *
 * For one-shot backfills after a prompt/schema upgrade. Avoids needing
 * worker daemons in separate terminals. Sets status to 'published' on
 * success so the public site keeps showing the listing.
 *
 * Usage:
 *   pnpm --filter @mpgenesis/paraphrase-worker exec tsx src/reprocess-inline.ts
 *   pnpm --filter @mpgenesis/paraphrase-worker exec tsx src/reprocess-inline.ts --force
 *
 * --force re-processes properties that already have contentVersion 2.
 */
import { createDb, properties, sources } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { isStructuredContent } from "@mpgenesis/shared";
import { paraphraseProperty } from "./paraphrase.js";
import { translateStructured } from "@mpgenesis/translate-worker";

async function main() {
  const force = process.argv.includes("--force");
  const db = createDb();

  const all = await db.select().from(properties);
  if (all.length === 0) {
    console.log("No properties in DB");
    process.exit(0);
  }

  const targets = all.filter((p) => {
    const rawData = (p.rawData ?? {}) as Record<string, unknown>;
    const desc = (rawData["description"] as string) ?? "";
    if (!desc || desc.length < 50) return false;
    if (force) return true;
    return !isStructuredContent(p.contentEs);
  });

  console.log(`\n${all.length} total properties, ${targets.length} need reprocessing\n`);

  if (targets.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  let totalCost = 0;
  let success = 0;
  let failed = 0;
  const failures: Array<{ id: string; title: string; error: string }> = [];

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    if (!p) continue;
    const rawData = (p.rawData ?? {}) as Record<string, unknown>;
    const description = (rawData["description"] as string) ?? "";

    const label = `[${i + 1}/${targets.length}] ${p.title.slice(0, 50)}`;
    console.log(`${label} ...`);

    try {
      // Load source domain for anonimato suppress list
      const [source] = await db
        .select({ domain: sources.domain })
        .from(sources)
        .where(eq(sources.id, p.sourceId))
        .limit(1);

      const prohibitedNames: string[] = [];
      if (p.developerName) prohibitedNames.push(p.developerName);
      if (p.developmentName) prohibitedNames.push(p.developmentName);
      if (source?.domain) {
        prohibitedNames.push(source.domain);
        const root = source.domain.split(".")[0];
        if (root && root.length > 3) prohibitedNames.push(root);
      }

      // ES paraphrase
      const para = await paraphraseProperty({
        originalTitle: p.title,
        originalDescription: description,
        city: p.city,
        state: p.state,
        neighborhood: p.neighborhood,
        propertyType: p.propertyType,
        listingType: p.listingType,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        constructionM2: p.constructionM2,
        developerName: p.developerName,
        developmentName: p.developmentName,
        sourceDomain: source?.domain ?? null,
      });
      totalCost += para.usage.costUsd;
      await db
        .update(properties)
        .set({ contentEs: para.content })
        .where(eq(properties.id, p.id));

      // EN translate
      const en = await translateStructured(para.content, "en", prohibitedNames);
      totalCost += en.usage.costUsd;
      await db
        .update(properties)
        .set({ contentEn: en.content })
        .where(eq(properties.id, p.id));

      // FR translate
      const fr = await translateStructured(para.content, "fr", prohibitedNames);
      totalCost += fr.usage.costUsd;
      await db
        .update(properties)
        .set({ contentFr: fr.content, status: "published" })
        .where(eq(properties.id, p.id));

      success++;
      const stepCost =
        para.usage.costUsd + en.usage.costUsd + fr.usage.costUsd;
      console.log(
        `  ✓ ES(${para.content.faq.length}faq) EN(${en.content.faq.length}) FR(${fr.content.faq.length}) — $${stepCost.toFixed(4)} — running total $${totalCost.toFixed(4)}`,
      );
    } catch (err) {
      failed++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      failures.push({ id: p.id, title: p.title, error: errorMsg });
      console.log(`  ✗ ${errorMsg}`);
    }
  }

  console.log("\n=========================================");
  console.log("REPROCESS COMPLETE");
  console.log(`  Success: ${success}/${targets.length}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total cost: $${totalCost.toFixed(4)} USD`);
  console.log("=========================================\n");

  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) {
      console.log(`  ${f.id} ${f.title.slice(0, 50)}: ${f.error}`);
    }
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
