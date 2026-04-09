import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedProperty } from "@mpgenesis/shared";
import { createLogger } from "@mpgenesis/shared";
import { extractStructuredText } from "./html-cleaner.js";

const logger = createLogger("extract:tier3");

/** Tier 3 — LLM extraction with Claude + tool_use (fallback).
 *
 * Sends cleaned text (P5) to Claude with a structured tool definition
 * matching ExtractedProperty schema. Claude extracts and returns
 * validated data.
 *
 * Returns token usage for P6 observability.
 */
export interface Tier3Result {
  data: Partial<ExtractedProperty>;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

// Haiku pricing per 1M tokens (as of 2026)
const HAIKU_INPUT_COST = 0.80 / 1_000_000;
const HAIKU_OUTPUT_COST = 4.00 / 1_000_000;

export async function extractTier3(
  html: string,
  sourceUrl: string,
): Promise<Tier3Result | null> {
  const cleanText = extractStructuredText(html);

  if (cleanText.length < 50) {
    logger.warn({ sourceUrl }, "Tier 3: Text too short after cleaning");
    return null;
  }

  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system:
      "You are a real estate data extractor. Extract property listing " +
      "data from the provided text. Use the extract_property tool to " +
      "return structured data. Only extract facts present in the text. " +
      "Do NOT invent or guess missing values — use null instead.",
    messages: [
      {
        role: "user",
        content: `Extract property listing data from this page (${sourceUrl}):\n\n${cleanText}`,
      },
    ],
    tools: [
      {
        name: "extract_property",
        description: "Extract structured property listing data",
        input_schema: {
          type: "object" as const,
          properties: {
            title: { type: "string", description: "Property title" },
            propertyType: {
              type: "string",
              enum: [
                "apartment",
                "house",
                "land",
                "villa",
                "penthouse",
                "office",
                "commercial",
              ],
              description: "Type of property",
            },
            listingType: {
              type: "string",
              enum: ["sale", "rent", "presale"],
              description: "Sale, rent, or presale",
            },
            priceCents: {
              type: "number",
              nullable: true,
              description: "Price in cents (e.g., 5500000 MXN = 550000000)",
            },
            currency: {
              type: "string",
              enum: ["MXN", "USD", "EUR"],
              description: "Price currency",
            },
            bedrooms: {
              type: "number",
              nullable: true,
              description: "Number of bedrooms",
            },
            bathrooms: {
              type: "number",
              nullable: true,
              description: "Number of bathrooms",
            },
            constructionM2: {
              type: "number",
              nullable: true,
              description: "Construction area in m2",
            },
            landM2: {
              type: "number",
              nullable: true,
              description: "Land area in m2",
            },
            parkingSpaces: {
              type: "number",
              nullable: true,
              description: "Number of parking spaces",
            },
            state: { type: "string", description: "State (e.g., Quintana Roo)" },
            city: {
              type: "string",
              description: "City (e.g., Playa del Carmen)",
            },
            neighborhood: {
              type: "string",
              nullable: true,
              description: "Neighborhood/colonia",
            },
            address: {
              type: "string",
              nullable: true,
              description: "Street address",
            },
          },
          required: ["title", "propertyType", "listingType", "state", "city"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "extract_property" },
  });

  // Find the tool use block
  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    logger.warn({ sourceUrl }, "Tier 3: No tool_use in response");
    return null;
  }

  const extracted = toolBlock.input as Record<string, unknown>;
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd =
    inputTokens * HAIKU_INPUT_COST + outputTokens * HAIKU_OUTPUT_COST;

  logger.info(
    { sourceUrl, inputTokens, outputTokens, costUsd: costUsd.toFixed(6) },
    "Tier 3: Extraction complete",
  );

  return {
    data: {
      sourceUrl,
      title: String(extracted["title"] ?? ""),
      propertyType: extracted["propertyType"] as ExtractedProperty["propertyType"],
      listingType: extracted["listingType"] as ExtractedProperty["listingType"],
      priceCents: extracted["priceCents"] as number | null,
      currency: (extracted["currency"] as ExtractedProperty["currency"]) ?? "MXN",
      bedrooms: extracted["bedrooms"] as number | null,
      bathrooms: extracted["bathrooms"] as number | null,
      constructionM2: extracted["constructionM2"] as number | null,
      landM2: extracted["landM2"] as number | null,
      parkingSpaces: extracted["parkingSpaces"] as number | null,
      state: String(extracted["state"] ?? ""),
      city: String(extracted["city"] ?? ""),
      neighborhood: (extracted["neighborhood"] as string) ?? null,
      address: (extracted["address"] as string) ?? null,
    },
    usage: { inputTokens, outputTokens, costUsd },
  };
}
