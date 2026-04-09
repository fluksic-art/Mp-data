/** P1: Separate facts from prose BEFORE sending to LLM.
 *
 * Facts (price, m2, bedrooms, address, coordinates) stay as placeholders.
 * Only prose goes to Claude for paraphrasing.
 * After paraphrase, placeholders are replaced with original facts.
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
  placeholder: (match: string, index: number) => string;
}> = [
  // Prices: $5,500,000 MXN, USD 450,000, etc.
  {
    regex: /\$[\d,]+(?:\.\d{1,2})?(?:\s*(?:MXN|USD|EUR|pesos|dollars))?/gi,
    placeholder: (_m, i) => `{{PRICE_${i}}}`,
  },
  {
    regex: /(?:MXN|USD|EUR)\s*\$?[\d,]+(?:\.\d{1,2})?/gi,
    placeholder: (_m, i) => `{{PRICE_${i}}}`,
  },
  // Areas: 120 m², 500 m2, 1,200 sq ft
  {
    regex: /[\d,]+(?:\.\d+)?\s*(?:m²|m2|sqft|sq\s*ft|hectáreas|ha)(?:\b|(?=\s|$))/gi,
    placeholder: (_m, i) => `{{AREA_${i}}}`,
  },
  // Bedrooms/bathrooms: 3 recámaras, 2 bathrooms, 4 bed
  {
    regex: /\d+\s*(?:recámaras?|rec|bedrooms?|bed|baños?|bathrooms?|bath)\b/gi,
    placeholder: (_m, i) => `{{ROOMS_${i}}}`,
  },
  // Phone numbers
  {
    regex: /\+?\d[\d\s\-()]{7,}\d/g,
    placeholder: (_m, i) => `{{PHONE_${i}}}`,
  },
  // Coordinates
  {
    regex: /-?\d{1,3}\.\d{4,}/g,
    placeholder: (_m, i) => `{{COORD_${i}}}`,
  },
];

export function splitFactsFromProse(text: string): SplitResult {
  const facts: FactMap = {};
  let result = text;
  let globalIndex = 0;

  for (const pattern of FACT_PATTERNS) {
    result = result.replace(pattern.regex, (match) => {
      const key = pattern.placeholder(match, globalIndex++);
      facts[key] = match;
      return key;
    });
  }

  return { textWithPlaceholders: result, facts };
}

export function reassembleProse(
  paraphrasedText: string,
  facts: FactMap,
): string {
  let result = paraphrasedText;
  for (const [placeholder, value] of Object.entries(facts)) {
    result = result.replaceAll(placeholder, value);
  }
  return result;
}
