import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "@mpgenesis/shared";

const logger = createLogger("translate");

const SONNET_INPUT_COST = 3.0 / 1_000_000;
const SONNET_OUTPUT_COST = 15.0 / 1_000_000;

export interface TranslateResult {
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

const LOCALE_CONFIG = {
  en: {
    name: "English",
    instruction: "Translate the following Spanish real estate listing text to English. Use terminology common in international real estate marketing (e.g., 'condo' not 'flat', 'amenities' not 'facilities').",
  },
  fr: {
    name: "French",
    instruction: "Traduisez le texte suivant d'une annonce immobilière de l'espagnol vers le français. Utilisez la terminologie courante dans le marketing immobilier international francophone.",
  },
} as const;

export async function translateProperty(
  titleEs: string,
  descriptionEs: string,
  metaTitleEs: string,
  metaDescriptionEs: string,
  h1Es: string,
  targetLocale: "en" | "fr",
): Promise<TranslateResult> {
  const config = LOCALE_CONFIG[targetLocale];
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: `${config.instruction}

Keep all {{PLACEHOLDER}} tokens exactly as they are — do not translate them.
Do NOT add information not present in the original.
Respond with a JSON object containing: title, description, metaTitle, metaDescription, h1.
Respond with JSON only, no markdown.`,
    messages: [
      {
        role: "user",
        content: `Translate to ${config.name}:

TITLE: ${titleEs}
DESCRIPTION: ${descriptionEs}
META TITLE: ${metaTitleEs}
META DESCRIPTION: ${metaDescriptionEs}
H1: ${h1Es}`,
      },
    ],
  });

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd =
    inputTokens * SONNET_INPUT_COST + outputTokens * SONNET_OUTPUT_COST;

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  let parsed: Record<string, string>;
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    logger.warn({ locale: targetLocale }, "Failed to parse translation JSON");
    parsed = {
      title: titleEs,
      description: descriptionEs,
      metaTitle: metaTitleEs,
      metaDescription: metaDescriptionEs,
      h1: h1Es,
    };
  }

  logger.info(
    { locale: targetLocale, inputTokens, outputTokens, costUsd: costUsd.toFixed(4) },
    "Translation complete",
  );

  return {
    title: parsed["title"] ?? titleEs,
    description: parsed["description"] ?? descriptionEs,
    metaTitle: parsed["metaTitle"] ?? metaTitleEs,
    metaDescription: parsed["metaDescription"] ?? metaDescriptionEs,
    h1: parsed["h1"] ?? h1Es,
    usage: { inputTokens, outputTokens, costUsd },
  };
}
