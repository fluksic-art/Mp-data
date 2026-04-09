import type { ExtractedProperty } from "@mpgenesis/shared";
import { createLogger } from "@mpgenesis/shared";
import { extractTier1 } from "./tier1.js";
import { extractTier3, type Tier3Result } from "./tier3.js";

const logger = createLogger("extract");

export interface ExtractionResult {
  data: Partial<ExtractedProperty>;
  tier: 1 | 3;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
}

/** Run extraction pipeline: Tier 1 → Tier 3.
 *
 * Tier 1 (deterministic, free) runs first.
 * Tier 3 (Claude Haiku, ~$0.002-0.005) only if Tier 1 fails.
 *
 * Per constitution: Tier 2 (CSS schema auto-generation) is Phase 4.
 */
export async function extractProperty(
  html: string,
  sourceUrl: string,
): Promise<ExtractionResult | null> {
  // Tier 1: JSON-LD / OpenGraph / meta
  const tier1 = extractTier1(html, sourceUrl);

  if (tier1 && hasMinimumData(tier1)) {
    logger.info({ sourceUrl, tier: 1 }, "Extracted via Tier 1 (free)");
    return { data: tier1, tier: 1 };
  }

  // Tier 3: Claude Haiku extraction
  logger.info({ sourceUrl }, "Tier 1 insufficient, falling back to Tier 3");

  const tier3 = await extractTier3(html, sourceUrl);

  if (tier3 && hasMinimumData(tier3.data)) {
    logger.info(
      { sourceUrl, tier: 3, costUsd: tier3.usage.costUsd },
      "Extracted via Tier 3 (Claude)",
    );
    return { data: tier3.data, tier: 3, usage: tier3.usage };
  }

  logger.warn({ sourceUrl }, "Extraction failed: no sufficient data from any tier");
  return null;
}

/** Check if extracted data has the minimum required fields */
function hasMinimumData(data: Partial<ExtractedProperty>): boolean {
  return Boolean(data.title && data.state && data.city);
}
