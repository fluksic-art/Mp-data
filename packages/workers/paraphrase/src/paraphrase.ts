import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "@mpgenesis/shared";
import { splitFactsFromProse, reassembleProse } from "./prose-splitter.js";

const logger = createLogger("paraphrase");

// Sonnet pricing per 1M tokens
const SONNET_INPUT_COST = 3.0 / 1_000_000;
const SONNET_OUTPUT_COST = 15.0 / 1_000_000;

export interface ParaphraseResult {
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

const SYSTEM_PROMPT = `You are a professional real estate copywriter for the Mexican Riviera Maya market. Your job is to rewrite property listing descriptions to be unique, engaging, and SEO-friendly.

INSTRUCTIONS:
1. DO NOT add information not in the original text
2. DO NOT invent amenities, features, or characteristics
3. DO NOT modify any {{PLACEHOLDER}} tokens — keep them exactly as they appear
4. DO NOT add subjective opinions about the neighborhood or market
5. DO NOT use superlatives unless the original text uses them
6. YES: reorganize paragraphs for better flow
7. YES: improve grammar and readability
8. YES: use synonyms while maintaining meaning
9. The tone should be professional, luxury-oriented, and inviting

You MUST respond with a JSON object containing these fields:
- title: A rewritten title (50-60 chars)
- description: The rewritten description
- metaTitle: SEO meta title (50-60 chars)
- metaDescription: SEO meta description (120-160 chars)
- h1: H1 heading for the page`;

export async function paraphraseProperty(
  originalTitle: string,
  originalDescription: string,
  city: string,
  propertyType: string,
): Promise<ParaphraseResult> {
  // P1: Split facts from prose
  const { textWithPlaceholders, facts } =
    splitFactsFromProse(originalDescription);

  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Rewrite this property listing. Keep all {{PLACEHOLDER}} tokens intact.

ORIGINAL TITLE: ${originalTitle}

ORIGINAL DESCRIPTION:
${textWithPlaceholders}

PROPERTY TYPE: ${propertyType}
CITY: ${city}

Respond with JSON only, no markdown.`,
      },
    ],
  });

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd =
    inputTokens * SONNET_INPUT_COST + outputTokens * SONNET_OUTPUT_COST;

  // Parse response
  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  let parsed: Record<string, string>;
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    logger.warn({ text: text.slice(0, 200) }, "Failed to parse LLM JSON, using fallback");
    parsed = {
      title: originalTitle,
      description: textWithPlaceholders,
      metaTitle: originalTitle.slice(0, 60),
      metaDescription: textWithPlaceholders.slice(0, 160),
      h1: originalTitle,
    };
  }

  // P1: Reassemble facts into paraphrased prose
  const result: ParaphraseResult = {
    title: reassembleProse(parsed["title"] ?? originalTitle, facts),
    description: reassembleProse(
      parsed["description"] ?? textWithPlaceholders,
      facts,
    ),
    metaTitle: reassembleProse(
      parsed["metaTitle"] ?? originalTitle.slice(0, 60),
      facts,
    ),
    metaDescription: reassembleProse(
      parsed["metaDescription"] ?? textWithPlaceholders.slice(0, 160),
      facts,
    ),
    h1: reassembleProse(parsed["h1"] ?? originalTitle, facts),
    usage: { inputTokens, outputTokens, costUsd },
  };

  logger.info(
    { inputTokens, outputTokens, costUsd: costUsd.toFixed(4) },
    "Paraphrase complete",
  );

  return result;
}
