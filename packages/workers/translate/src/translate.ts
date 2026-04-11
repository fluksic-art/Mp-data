import Anthropic from "@anthropic-ai/sdk";
import {
  createLogger,
  detectForbidden,
  type StructuredContent,
} from "@mpgenesis/shared";

const logger = createLogger("translate");

const SONNET_INPUT_COST = 3.0 / 1_000_000;
const SONNET_OUTPUT_COST = 15.0 / 1_000_000;

export interface TranslateResult {
  content: StructuredContent;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

const LOCALE_CONFIG = {
  en: {
    name: "English",
    instruction:
      "Translate the following Spanish real estate listing into natural, conversion-oriented English aimed at international buyers (US, Canada, UK). Use terminology common in international real estate marketing (e.g., 'condo' not 'flat', 'amenities' not 'facilities', 'bedroom' not 'room'). Keep the tone warm, professional and specific. Use short paragraphs (2-3 sentences max).",
    forbiddenInstruction:
      "NEVER use these phrases or their variants: 'unique opportunity', 'guaranteed return', 'unlimited potential', 'amazing', 'the best', 'one of a kind', 'must see', 'fixer', 'TLC', 'won't last'.",
  },
  fr: {
    name: "French",
    instruction:
      "Traduisez l'annonce immobilière suivante de l'espagnol vers un français naturel et orienté conversion, destiné à des acheteurs internationaux francophones. Utilisez la terminologie courante du marketing immobilier international francophone. Gardez un ton chaleureux, professionnel et spécifique. Utilisez des paragraphes courts (2-3 phrases max).",
    forbiddenInstruction:
      "N'utilisez JAMAIS ces phrases ni leurs variantes: 'opportunité unique', 'rendement garanti', 'potentiel illimité', 'incroyable', 'le meilleur', 'à ne pas manquer'.",
  },
} as const;

/** Strip any stray `{{PLACEHOLDER}}` tokens the LLM may have hallucinated
 * into the translation. The source content is already fully reassembled
 * (literal prices, areas, rooms), so any remaining placeholders in the
 * translated output are model artifacts and should be removed entirely.
 */
function stripStrayPlaceholders(content: StructuredContent): StructuredContent {
  const strip = (s: string): string =>
    s
      .replace(/\{\{[A-Z_0-9]+\}\}/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/,\s*,/g, ",")
      .trim();
  return {
    ...content,
    hero: {
      h1: strip(content.hero.h1),
      intro: strip(content.hero.intro),
    },
    features: {
      heading: strip(content.features.heading),
      body: strip(content.features.body),
    },
    location: {
      heading: strip(content.location.heading),
      body: strip(content.location.body),
    },
    lifestyle: {
      heading: strip(content.lifestyle.heading),
      body: strip(content.lifestyle.body),
    },
    faq: content.faq.map((f) => ({
      question: strip(f.question),
      answer: strip(f.answer),
    })),
    metaTitle: strip(content.metaTitle),
    metaDescription: strip(content.metaDescription),
  };
}

export async function translateStructured(
  source: StructuredContent,
  targetLocale: "en" | "fr",
  prohibitedNames: string[] = [],
): Promise<TranslateResult> {
  const config = LOCALE_CONFIG[targetLocale];
  const client = new Anthropic();

  const userMessage = buildUserMessage(source, targetLocale, prohibitedNames);
  let response = await callClaude(client, config, userMessage, prohibitedNames);
  let translated = extractToolInput(response);
  if (!translated) {
    logger.warn(
      { locale: targetLocale },
      "Translate: no tool_use in first response, falling back to source",
    );
    translated = source;
  }
  // Remove any stray placeholders the LLM may have hallucinated. Source is
  // already reassembled so any `{{...}}` in the output is a bug.
  translated = stripStrayPlaceholders(translated);

  let inputTokens = response.usage.input_tokens;
  let outputTokens = response.usage.output_tokens;

  // Forbidden words + dynamic name check + ONE retry
  const violations = detectForbiddenAcrossContent(
    translated,
    targetLocale,
    prohibitedNames,
  );
  if (violations.length > 0) {
    logger.warn(
      { locale: targetLocale, violations },
      "Translate: forbidden words/names detected, retrying once",
    );
    const retryMessage = `${userMessage}\n\nIMPORTANT: Your previous attempt contained forbidden phrases or proper names: ${violations.join(", ")}. Rewrite removing them completely. Replace any proper development/developer/source name with a generic descriptor like "this development", "this property", "the project".`;
    response = await callClaude(client, config, retryMessage, prohibitedNames);
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    const retryRaw = extractToolInput(response);
    if (retryRaw) {
      const retryTranslated = stripStrayPlaceholders(retryRaw);
      const retryViolations = detectForbiddenAcrossContent(
        retryTranslated,
        targetLocale,
        prohibitedNames,
      );
      if (retryViolations.length === 0) {
        translated = retryTranslated;
      } else if (retryViolations.length < violations.length) {
        // Retry reduced violations — take it
        logger.warn(
          { locale: targetLocale, retryViolations },
          "Translate: retry reduced violations but did not eliminate them",
        );
        translated = retryTranslated;
      } else {
        // Retry equal or worse — keep the first attempt (already in `translated`)
        logger.warn(
          {
            locale: targetLocale,
            firstViolations: violations,
            retryViolations,
          },
          "Translate: retry no better than first attempt, keeping first",
        );
      }
    }
  }

  const costUsd =
    inputTokens * SONNET_INPUT_COST + outputTokens * SONNET_OUTPUT_COST;

  logger.info(
    {
      locale: targetLocale,
      inputTokens,
      outputTokens,
      costUsd: costUsd.toFixed(4),
      faqCount: translated.faq.length,
    },
    "Translation complete",
  );

  return {
    content: translated,
    usage: { inputTokens, outputTokens, costUsd },
  };
}

function buildUserMessage(
  source: StructuredContent,
  targetLocale: "en" | "fr",
  prohibitedNames: string[],
): string {
  const lang = LOCALE_CONFIG[targetLocale].name;
  const prohibitedSection =
    prohibitedNames.length > 0
      ? `\nPROHIBITED NAMES (NEVER use in any field, not even as part of a phrase):
${prohibitedNames.map((n) => `- "${n}"`).join("\n")}

If the Spanish source accidentally contains any of these names, replace them in your translation with generic descriptors like "this development", "this property", "the project", "this private complex".
`
      : "";

  return `Translate the following Spanish real estate listing into ${lang} using the write_listing tool. Preserve the same structure (5 blocks + FAQ + meta).

RULES:
- Do NOT introduce any placeholder tokens. The source is already fully assembled with literal values (prices, areas, bedroom counts). Translate them as literal text.
- Do NOT add information not present in the source.
- Do NOT shorten or expand the content significantly — match the source length per block.
- metaTitle MUST be 55 characters or fewer (leaves room for "| MPgenesis" brand suffix).
- metaDescription MUST be 150-160 characters, ALWAYS including the price and a call-to-action at the end.
${prohibitedSection}
SOURCE (Spanish):

H1: ${source.hero.h1}

INTRO:
${source.hero.intro}

FEATURES (${source.features.heading}):
${source.features.body}

LOCATION (${source.location.heading}):
${source.location.body}

LIFESTYLE (${source.lifestyle.heading}):
${source.lifestyle.body}

FAQ:
${source.faq.map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`).join("\n")}

META TITLE: ${source.metaTitle}
META DESCRIPTION: ${source.metaDescription}`;
}

async function callClaude(
  client: Anthropic,
  config: (typeof LOCALE_CONFIG)["en"] | (typeof LOCALE_CONFIG)["fr"],
  userMessage: string,
  prohibitedNames: string[],
): Promise<Anthropic.Messages.Message> {
  const prohibitedBlock =
    prohibitedNames.length > 0
      ? `\n\nANONYMITY RULE (CRITICAL): Never use the following proper names in any field of the output, not even as part of a phrase: ${prohibitedNames.map((n) => `"${n}"`).join(", ")}. If the Spanish source contains any of these, replace them with generic descriptors like "this development", "this property", "the project", "this private complex".`
      : "";
  return await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `${config.instruction}\n\nThe Spanish source is already fully assembled — do NOT introduce placeholder tokens like {{PRICE}} or similar. Translate literal values (prices, areas, bedroom counts) as literal text.\n\nDo NOT add information not present in the source.\n\n${config.forbiddenInstruction}${prohibitedBlock}\n\nUse the write_listing tool to return the structured translation.`,
    tools: [WRITE_LISTING_TOOL],
    tool_choice: { type: "tool", name: "write_listing" },
    messages: [{ role: "user", content: userMessage }],
  });
}

const WRITE_LISTING_TOOL: Anthropic.Messages.Tool = {
  name: "write_listing",
  description:
    "Return the structured translated listing with all 5 blocks + FAQ + meta",
  input_schema: {
    type: "object",
    properties: {
      heroH1: { type: "string" },
      heroIntro: { type: "string" },
      featuresHeading: { type: "string" },
      featuresBody: { type: "string" },
      locationHeading: { type: "string" },
      locationBody: { type: "string" },
      lifestyleHeading: { type: "string" },
      lifestyleBody: { type: "string" },
      faq: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            answer: { type: "string" },
          },
          required: ["question", "answer"],
        },
      },
      metaTitle: { type: "string" },
      metaDescription: { type: "string" },
    },
    required: [
      "heroH1",
      "heroIntro",
      "featuresHeading",
      "featuresBody",
      "locationHeading",
      "locationBody",
      "lifestyleHeading",
      "lifestyleBody",
      "faq",
      "metaTitle",
      "metaDescription",
    ],
  },
};

function extractToolInput(
  response: Anthropic.Messages.Message,
): StructuredContent | null {
  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") return null;
  const input = toolBlock.input as Record<string, unknown>;
  if (
    typeof input["heroH1"] !== "string" ||
    typeof input["heroIntro"] !== "string" ||
    typeof input["featuresBody"] !== "string" ||
    typeof input["locationBody"] !== "string" ||
    typeof input["lifestyleBody"] !== "string" ||
    !Array.isArray(input["faq"])
  ) {
    return null;
  }
  return {
    contentVersion: 2,
    hero: {
      h1: String(input["heroH1"]),
      intro: String(input["heroIntro"]),
    },
    features: {
      heading: String(input["featuresHeading"] ?? ""),
      body: String(input["featuresBody"]),
    },
    location: {
      heading: String(input["locationHeading"] ?? ""),
      body: String(input["locationBody"]),
    },
    lifestyle: {
      heading: String(input["lifestyleHeading"] ?? ""),
      body: String(input["lifestyleBody"]),
    },
    faq: (input["faq"] as Array<Record<string, unknown>>)
      .map((f) => ({
        question: String(f["question"] ?? ""),
        answer: String(f["answer"] ?? ""),
      }))
      .filter((f) => f.question && f.answer),
    metaTitle: String(input["metaTitle"] ?? ""),
    metaDescription: String(input["metaDescription"] ?? ""),
  };
}

function detectForbiddenAcrossContent(
  content: StructuredContent,
  locale: "en" | "fr",
  prohibitedNames: string[] = [],
): string[] {
  const all = [
    content.hero.h1,
    content.hero.intro,
    content.features.body,
    content.location.body,
    content.lifestyle.body,
    content.metaTitle,
    content.metaDescription,
    ...content.faq.flatMap((f) => [f.question, f.answer]),
  ].join("\n");
  const staticViolations = detectForbidden(all, locale);
  const dynamicViolations = detectProhibitedNames(all, prohibitedNames);
  return [...staticViolations, ...dynamicViolations];
}

function detectProhibitedNames(text: string, names: string[]): string[] {
  if (names.length === 0) return [];
  const haystack = foldAccents(text.toLowerCase());
  const found: string[] = [];
  for (const name of names) {
    if (!name || name.length < 3) continue;
    const needle = foldAccents(name.toLowerCase());
    if (haystack.includes(needle)) found.push(name);
  }
  return found;
}

function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
