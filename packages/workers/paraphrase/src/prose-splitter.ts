/** P1 + anonimato: separa hechos y PII de la prosa ANTES del LLM.
 *
 * Dos categorías:
 *
 * - FACTS (PRICE, AREA, ROOMS) → se reemplazan con `{{FACT_N}}` antes de
 *   mandar al LLM (para que el modelo no pueda alucinar o modificar
 *   números) y se REASAMBLAN literalmente después de la paráfrasis.
 *
 * - PII (PHONE, EMAIL, COORD) → también se reemplazan con `{{PII_N}}`
 *   antes del LLM, pero en la reasambly se ELIMINAN (replaced with
 *   empty string). Esto evita que teléfonos/emails de agentes del
 *   source terminen en la prosa generada que verá el cliente final.
 */

export interface FactMap {
  [placeholder: string]: string;
}

export interface SplitResult {
  textWithPlaceholders: string;
  facts: FactMap;
}

const FACT_PATTERNS: Array<{
  regex: RegExp;
  kind: "PRICE" | "AREA" | "ROOMS";
}> = [
  // Prices: $5,500,000 MXN, USD 450,000, etc.
  {
    regex: /\$[\d,]+(?:\.\d{1,2})?(?:\s*(?:MXN|USD|EUR|pesos|dollars))?/gi,
    kind: "PRICE",
  },
  {
    regex: /(?:MXN|USD|EUR)\s*\$?[\d,]+(?:\.\d{1,2})?/gi,
    kind: "PRICE",
  },
  // Areas: 120 m², 500 m2, 1,200 sq ft
  {
    regex:
      /[\d,]+(?:\.\d+)?\s*(?:m²|m2|sqft|sq\s*ft|hectáreas|ha)(?:\b|(?=\s|$))/gi,
    kind: "AREA",
  },
  // Bedrooms/bathrooms: 3 recámaras, 2 bathrooms, 4 bed
  {
    regex: /\d+\s*(?:recámaras?|rec|bedrooms?|bed|baños?|bathrooms?|bath)\b/gi,
    kind: "ROOMS",
  },
];

const PII_PATTERNS: Array<{
  regex: RegExp;
  kind: "PHONE" | "EMAIL" | "COORD";
}> = [
  // Email addresses
  {
    regex: /[\w.+-]+@[\w-]+\.[\w.-]+/gi,
    kind: "EMAIL",
  },
  // Phone numbers: +52 984 123 4567, (984) 123-4567, etc. (at least 8 digits)
  {
    regex: /\+?\d[\d\s\-()]{7,}\d/g,
    kind: "PHONE",
  },
  // Precise coordinates (lat/lon with 4+ decimal places)
  {
    regex: /-?\d{1,3}\.\d{4,}/g,
    kind: "COORD",
  },
];

/** Split the text into (placeholders + literal facts map).
 *
 * 1. PII is placeholdered FIRST (and order matters — emails before phones,
 *    so we don't accidentally match the digit sequence of a phone number
 *    that's part of an email username).
 * 2. Then FACTS are placeholdered.
 *
 * Only FACT placeholders get stored in the returned `facts` map — PII
 * placeholders are intentionally forgotten so `reassembleProse` can't
 * restore them.
 */
export function splitFactsFromProse(text: string): SplitResult {
  const facts: FactMap = {};
  let result = text;
  let globalIndex = 0;

  // Step 1: strip PII (don't store in facts map)
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern.regex, () => {
      const key = `{{PII_${globalIndex++}}}`;
      return key;
    });
  }

  // Step 2: placeholder facts (store for reassembly)
  for (const pattern of FACT_PATTERNS) {
    result = result.replace(pattern.regex, (match) => {
      const key = `{{FACT_${globalIndex++}}}`;
      facts[key] = match;
      return key;
    });
  }

  return { textWithPlaceholders: result, facts };
}

/** Reassemble literal facts into the paraphrased prose.
 *
 * - FACT placeholders are replaced with their literal source value.
 * - Any remaining PII placeholders are stripped (replaced with empty).
 * - Orphan whitespace and punctuation left by stripped PII is cleaned.
 */
export function reassembleProse(
  paraphrasedText: string,
  facts: FactMap,
): string {
  let result = paraphrasedText;

  // Reassemble facts literally
  for (const [placeholder, value] of Object.entries(facts)) {
    result = result.replaceAll(placeholder, value);
  }

  // Strip any remaining PII placeholders entirely
  result = result.replace(/\{\{PII_\d+\}\}/g, "");

  // Clean up: collapse double spaces and orphan punctuation left by PII removal
  result = result
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/,\s*,/g, ",")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  return result;
}
