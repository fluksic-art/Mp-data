#!/usr/bin/env node
/** Backfill developer_name, development_name, and slug_adjective for
 * existing properties using Claude Haiku with tool_use.
 *
 * Run this ONCE after migrating the schema to populate the new columns
 * from the data we already have in `properties.title` + `raw_data.description`.
 * Uses Haiku for cost (~$0.002 per listing × 30 = ~$0.06 total).
 *
 * Usage:
 *   pnpm --filter @mpgenesis/paraphrase-worker exec tsx src/backfill-dev-names.ts
 *   pnpm --filter @mpgenesis/paraphrase-worker exec tsx src/backfill-dev-names.ts --force
 *
 * --force re-runs extraction even for properties that already have values.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createDb, properties } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { createLogger, SLUG_ADJECTIVE_KEYS } from "@mpgenesis/shared";

const logger = createLogger("backfill-dev-names");

const HAIKU_INPUT_COST = 0.8 / 1_000_000;
const HAIKU_OUTPUT_COST = 4.0 / 1_000_000;

interface ExtractedDevMeta {
  developerName: string | null;
  developmentName: string | null;
  slugAdjective: string | null;
}

async function extractDevMeta(
  title: string,
  description: string,
): Promise<{
  meta: ExtractedDevMeta;
  inputTokens: number;
  outputTokens: number;
}> {
  const client = new Anthropic();
  const truncated = description.slice(0, 2000);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system:
      "You extract anonymized metadata from a real estate listing. Use the extract_dev_meta tool. Do NOT invent values — if a field is not clearly in the source, return null.",
    messages: [
      {
        role: "user",
        content: `Extract the developer name, development/project name, and the single most distinctive feature (slugAdjective) from this property listing.

TITLE: ${title}

DESCRIPTION (truncated):
${truncated}`,
      },
    ],
    tools: [
      {
        name: "extract_dev_meta",
        description:
          "Return the developer company name, the development/project name, and the single most distinctive feature adjective.",
        input_schema: {
          type: "object",
          properties: {
            developerName: {
              type: "string",
              nullable: true,
              description:
                "Company name of the developer/builder (e.g. 'Plalla Real Estate'). Null if not found.",
            },
            developmentName: {
              type: "string",
              nullable: true,
              description:
                "Name of the specific development or project (e.g. 'Lumma Habitat', 'Mayakana Residences'). Often appears in the title. Null if this is an individual listing with no project name.",
            },
            slugAdjective: {
              type: "string",
              enum: [...SLUG_ADJECTIVE_KEYS],
              nullable: true,
              description:
                "Pick EXACTLY one adjective from the enum that best describes the most distinctive feature, or null.",
            },
          },
          required: ["developerName", "developmentName", "slugAdjective"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "extract_dev_meta" },
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    return {
      meta: {
        developerName: null,
        developmentName: null,
        slugAdjective: null,
      },
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
  const input = toolBlock.input as Record<string, unknown>;
  const developerName = typeof input["developerName"] === "string"
    ? input["developerName"]
    : null;
  const developmentName = typeof input["developmentName"] === "string"
    ? input["developmentName"]
    : null;
  const slugAdjectiveRaw = input["slugAdjective"];
  const slugAdjective =
    typeof slugAdjectiveRaw === "string" &&
    (SLUG_ADJECTIVE_KEYS as readonly string[]).includes(slugAdjectiveRaw)
      ? slugAdjectiveRaw
      : null;

  return {
    meta: { developerName, developmentName, slugAdjective },
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function main() {
  const force = process.argv.includes("--force");
  const db = createDb();

  const all = await db.select().from(properties);
  if (all.length === 0) {
    logger.info("No properties in DB");
    process.exit(0);
  }

  const targets = all.filter((p) => {
    if (force) return true;
    return (
      p.developerName == null &&
      p.developmentName == null &&
      p.slugAdjective == null
    );
  });

  console.log(
    `\n${all.length} total, ${targets.length} need backfill\n`,
  );

  let totalCost = 0;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    if (!p) continue;
    const rawData = (p.rawData ?? {}) as Record<string, unknown>;
    const description = (rawData["description"] as string) ?? "";

    const label = `[${i + 1}/${targets.length}] ${p.title.slice(0, 50)}`;
    process.stdout.write(`${label} ... `);

    try {
      const { meta, inputTokens, outputTokens } = await extractDevMeta(
        p.title,
        description,
      );
      const cost =
        inputTokens * HAIKU_INPUT_COST + outputTokens * HAIKU_OUTPUT_COST;
      totalCost += cost;

      await db
        .update(properties)
        .set({
          developerName: meta.developerName,
          developmentName: meta.developmentName,
          slugAdjective: meta.slugAdjective,
        })
        .where(eq(properties.id, p.id));

      success++;
      console.log(
        `✓ dev=${meta.developerName ?? "—"} / proj=${meta.developmentName ?? "—"} / adj=${meta.slugAdjective ?? "—"} ($${cost.toFixed(4)})`,
      );
    } catch (err) {
      failed++;
      console.log(`✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n=========================================");
  console.log("BACKFILL COMPLETE");
  console.log(`  Success: ${success}/${targets.length}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total cost: $${totalCost.toFixed(4)} USD`);
  console.log("=========================================\n");

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
