/** Forbidden marketing language for property descriptions.
 *
 * From the Propyte Manual de Descripciones (Parte 4.1 + regla anti-humo Parte 3.4):
 * - Vague aspirational claims that erode trust ("oportunidad única", "lujo extremo")
 * - Yield/return guarantees we cannot back ("garantizado", "potencial ilimitado")
 * - Zillow research: words that statistically REDUCE sale price ("nice", "fixer",
 *   "potential", "investment" used as empty adjective)
 *
 * Detection is case-insensitive and matches whole-word boundaries to avoid
 * false positives ("nice" should not match "Venice"). Multi-word phrases
 * match as substrings since punctuation/spacing varies.
 */

export type Locale = "es" | "en" | "fr";

export const FORBIDDEN_WORDS_ES: readonly string[] = [
  "oportunidad única",
  "oportunidad unica",
  "garantizado",
  "rendimiento garantizado",
  "potencial ilimitado",
  "increíble",
  "increible",
  "el mejor",
  "la mejor",
  "único en su tipo",
  "unico en su tipo",
  "lujo extremo",
  "imperdible",
  "no te lo puedes perder",
  "una oportunidad como esta",
];

export const FORBIDDEN_WORDS_EN: readonly string[] = [
  "unique opportunity",
  "guaranteed return",
  "guaranteed yield",
  "unlimited potential",
  "amazing",
  "the best",
  "one of a kind",
  "must see",
  "must-see",
  "fixer",
  "tlc",
  "won't last",
  "wont last",
];

export const FORBIDDEN_WORDS_FR: readonly string[] = [
  "opportunité unique",
  "opportunite unique",
  "rendement garanti",
  "potentiel illimité",
  "potentiel illimite",
  "incroyable",
  "à ne pas manquer",
  "a ne pas manquer",
  "le meilleur",
  "la meilleure",
];

const LISTS: Record<Locale, readonly string[]> = {
  es: FORBIDDEN_WORDS_ES,
  en: FORBIDDEN_WORDS_EN,
  fr: FORBIDDEN_WORDS_FR,
};

/** Escape regex metacharacters in a literal string */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Detect forbidden phrases in `text` for a given locale.
 *
 * Returns the unique list of phrases found (lowercased). Empty array
 * means the text is clean.
 *
 * Uses word-boundary matching for single-word terms and substring
 * matching for multi-word phrases. Accents are folded so "increíble"
 * matches "increible".
 */
export function detectForbidden(text: string, locale: Locale): string[] {
  if (!text) return [];
  const haystack = foldAccents(text.toLowerCase());
  const found = new Set<string>();

  for (const phrase of LISTS[locale]) {
    const needle = foldAccents(phrase.toLowerCase());
    const isSingleWord = !needle.includes(" ") && !needle.includes("-");
    if (isSingleWord) {
      const re = new RegExp(`\\b${escapeRegex(needle)}\\b`, "u");
      if (re.test(haystack)) found.add(phrase);
    } else if (haystack.includes(needle)) {
      found.add(phrase);
    }
  }

  return Array.from(found);
}

function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
