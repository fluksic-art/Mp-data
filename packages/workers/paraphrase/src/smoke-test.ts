#!/usr/bin/env node
/** Smoke test: run paraphrase + EN + FR translate against ONE property
 * inline (no BullMQ workers required) and print a summary of the result.
 *
 * Usage:
 *   pnpm --filter @mpgenesis/paraphrase-worker exec tsx src/smoke-test.ts <propertyId>
 *
 * If <propertyId> is omitted, the script picks the first property in the DB.
 *
 * IMPORTANT: This is for the manual implementation v2 smoke test only.
 * For batch reprocessing use src/reprocess.ts which uses BullMQ.
 */
import { createDb, properties, sources } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { createLogger, isStructuredContent } from "@mpgenesis/shared";
import { paraphraseProperty } from "./paraphrase.js";
import { translateStructured } from "@mpgenesis/translate-worker";

const logger = createLogger("smoke-test");

async function main() {
  const propertyIdArg = process.argv[2];
  const db = createDb();

  const [property] = propertyIdArg
    ? await db
        .select()
        .from(properties)
        .where(eq(properties.id, propertyIdArg))
        .limit(1)
    : await db.select().from(properties).limit(1);

  if (!property) {
    logger.error({ propertyIdArg }, "Property not found");
    process.exit(1);
  }

  const rawData = property.rawData as Record<string, unknown>;
  const description = (rawData["description"] as string) ?? "";
  if (!description || description.length < 50) {
    logger.error(
      { propertyId: property.id },
      "Property has no usable description in rawData",
    );
    process.exit(1);
  }

  // Load source domain for anonimato suppress list
  const [source] = await db
    .select({ domain: sources.domain })
    .from(sources)
    .where(eq(sources.id, property.sourceId))
    .limit(1);

  const prohibitedNames: string[] = [];
  if (property.developerName) prohibitedNames.push(property.developerName);
  if (property.developmentName) prohibitedNames.push(property.developmentName);
  if (source?.domain) {
    prohibitedNames.push(source.domain);
    const root = source.domain.split(".")[0];
    if (root && root.length > 3) prohibitedNames.push(root);
  }

  console.log("\n=========================================");
  console.log(`SMOKE TEST: ${property.title}`);
  console.log(`Property ID: ${property.id}`);
  console.log(`City: ${property.city}, ${property.state}`);
  console.log(`Type: ${property.propertyType} / ${property.listingType}`);
  console.log(`Bedrooms: ${property.bedrooms ?? "n/a"}`);
  console.log(
    `Price: ${property.priceCents ? `${property.currency} ${property.priceCents / 100}` : "n/a"}`,
  );
  console.log(`Developer: ${property.developerName ?? "—"}`);
  console.log(`Development: ${property.developmentName ?? "—"}`);
  console.log(`Slug adjective: ${property.slugAdjective ?? "—"}`);
  console.log(`Prohibited names: [${prohibitedNames.join(", ")}]`);
  console.log(`Source description length: ${description.length} chars`);
  console.log("=========================================\n");

  // ─────────────────────────────────────
  // STEP 1: Paraphrase to ES
  // ─────────────────────────────────────
  console.log("→ Step 1/3: Paraphrasing to ES...");
  const paraphraseResult = await paraphraseProperty({
    originalTitle: property.title,
    originalDescription: description,
    city: property.city,
    state: property.state,
    neighborhood: property.neighborhood,
    propertyType: property.propertyType,
    listingType: property.listingType,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    constructionM2: property.constructionM2,
    developerName: property.developerName,
    developmentName: property.developmentName,
    sourceDomain: source?.domain ?? null,
  });

  const esContent = paraphraseResult.content;
  console.log(
    `  ✓ ES done. Tokens: ${paraphraseResult.usage.inputTokens} in / ${paraphraseResult.usage.outputTokens} out, $${paraphraseResult.usage.costUsd.toFixed(4)}`,
  );
  printSummary("ES", esContent);

  // Persist
  await db
    .update(properties)
    .set({ contentEs: esContent })
    .where(eq(properties.id, property.id));

  // ─────────────────────────────────────
  // STEP 2: Translate ES → EN
  // ─────────────────────────────────────
  console.log("\n→ Step 2/3: Translating ES → EN...");
  const enResult = await translateStructured(esContent, "en", prohibitedNames);
  console.log(
    `  ✓ EN done. Tokens: ${enResult.usage.inputTokens} in / ${enResult.usage.outputTokens} out, $${enResult.usage.costUsd.toFixed(4)}`,
  );
  printSummary("EN", enResult.content);

  await db
    .update(properties)
    .set({ contentEn: enResult.content })
    .where(eq(properties.id, property.id));

  // ─────────────────────────────────────
  // STEP 3: Translate ES → FR
  // ─────────────────────────────────────
  console.log("\n→ Step 3/3: Translating ES → FR...");
  const frResult = await translateStructured(esContent, "fr", prohibitedNames);
  console.log(
    `  ✓ FR done. Tokens: ${frResult.usage.inputTokens} in / ${frResult.usage.outputTokens} out, $${frResult.usage.costUsd.toFixed(4)}`,
  );
  printSummary("FR", frResult.content);

  await db
    .update(properties)
    .set({ contentFr: frResult.content, status: "review" })
    .where(eq(properties.id, property.id));

  // ─────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────
  const totalCost =
    paraphraseResult.usage.costUsd +
    enResult.usage.costUsd +
    frResult.usage.costUsd;
  console.log("\n=========================================");
  console.log("SMOKE TEST COMPLETE");
  console.log(`Total cost: $${totalCost.toFixed(4)} USD`);
  console.log(`Property status: review`);
  console.log("=========================================\n");

  // Anonimato check — fail the smoke test if any prohibited name leaked
  const allProse = [esContent, enResult.content, frResult.content]
    .flatMap((c) => [
      c.hero.h1,
      c.hero.intro,
      c.features.body,
      c.location.body,
      c.lifestyle.body,
      c.metaTitle,
      c.metaDescription,
      ...c.faq.flatMap((f) => [f.question, f.answer]),
    ])
    .join("\n")
    .toLowerCase();
  const nameLeaks = prohibitedNames.filter(
    (n) => n.length >= 3 && allProse.includes(n.toLowerCase()),
  );

  // Sanity checks. Meta length checks are SOFT (Google truncates anyway),
  // only the anonimato + structure checks are hard failures.
  const checks: Array<{ name: string; pass: boolean }> = [
    { name: "ES is structured v2", pass: isStructuredContent(esContent) },
    { name: "EN is structured v2", pass: isStructuredContent(enResult.content) },
    { name: "FR is structured v2", pass: isStructuredContent(frResult.content) },
    {
      name: "ES has 5-8 FAQs",
      pass: esContent.faq.length >= 5 && esContent.faq.length <= 8,
    },
    {
      name: "EN has 5-8 FAQs",
      pass:
        enResult.content.faq.length >= 5 && enResult.content.faq.length <= 8,
    },
    {
      name: "FR has 5-8 FAQs",
      pass:
        frResult.content.faq.length >= 5 && frResult.content.faq.length <= 8,
    },
    {
      name: "NO prohibited names leaked",
      pass: nameLeaks.length === 0,
    },
    {
      name: "NO stray {{placeholder}} tokens",
      pass: !/\{\{[A-Z_0-9]+\}\}/.test(allProse),
    },
    // Soft checks (warnings only — Google truncates meta anyway)
    {
      name: "ES metaTitle ≤ 65 (soft)",
      pass: esContent.metaTitle.length <= 65,
    },
    {
      name: "ES metaDescription ≤ 165 (soft)",
      pass: esContent.metaDescription.length <= 165,
    },
  ];
  if (nameLeaks.length > 0) {
    console.log(`\n⚠️  NAME LEAKS: ${nameLeaks.join(", ")}\n`);
  }
  console.log("CHECKS:");
  for (const c of checks) {
    console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}`);
  }
  const failed = checks.filter((c) => !c.pass).length;
  console.log(
    `\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}\n`,
  );

  process.exit(failed === 0 ? 0 : 1);
}

function printSummary(
  locale: string,
  content: import("@mpgenesis/shared").StructuredContent,
): void {
  console.log(`\n  [${locale}] H1: ${content.hero.h1}`);
  console.log(`  [${locale}] metaTitle (${content.metaTitle.length}c): ${content.metaTitle}`);
  console.log(
    `  [${locale}] metaDesc (${content.metaDescription.length}c): ${content.metaDescription}`,
  );
  console.log(
    `  [${locale}] hero.intro (${wc(content.hero.intro)}w): ${content.hero.intro.slice(0, 120)}...`,
  );
  console.log(
    `  [${locale}] features.body (${wc(content.features.body)}w): ${content.features.body.slice(0, 120)}...`,
  );
  console.log(
    `  [${locale}] location.body (${wc(content.location.body)}w): ${content.location.body.slice(0, 120)}...`,
  );
  console.log(
    `  [${locale}] lifestyle.body (${wc(content.lifestyle.body)}w): ${content.lifestyle.body.slice(0, 120)}...`,
  );
  console.log(`  [${locale}] FAQs: ${content.faq.length}`);
  content.faq.slice(0, 2).forEach((f, i) => {
    console.log(`    ${i + 1}. Q: ${f.question}`);
    console.log(`       A: ${f.answer.slice(0, 100)}...`);
  });
}

function wc(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

main().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err);
  process.exit(1);
});
