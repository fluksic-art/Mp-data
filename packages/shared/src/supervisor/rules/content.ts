import type { StructuredContent } from "../../schemas/structured-content.js";
import type { SupervisorIssue } from "../../schemas/supervisor.js";
import { detectForbidden } from "../../seo/forbidden-words.js";
import type { PropertyForSupervisor } from "../property-input.js";

export type ContentLocale = "es" | "en" | "fr";

const PLACEHOLDER_RE = /\{\{(FACT|PII)_\d+\}\}/;

/** Structural word-count targets per block.
 *
 * Same numbers the paraphrase worker warns on (see validateWordCounts in
 * packages/workers/paraphrase/src/paraphrase.ts) but here we flag as
 * errors/warnings instead of silent log lines. */
const WORD_COUNT_TARGETS: Record<string, { min: number; max: number }> = {
  "hero.intro": { min: 100, max: 250 },
  "features.body": { min: 100, max: 250 },
  "location.body": { min: 100, max: 250 },
  "lifestyle.body": { min: 70, max: 200 },
};

/** Ratio of concrete numbers/cifras per 100 words — below this a block
 * reads as generic filler. Heuristic; tuned loose to avoid noise. */
const MIN_SPECIFICITY_PER_100_WORDS = 0.5;

/** N-gram duplication across blocks (4-gram overlap > this fraction
 * = content is being repeated / padded). */
const MAX_NGRAM_OVERLAP = 0.4;

export function runContentRules(
  p: PropertyForSupervisor,
): SupervisorIssue[] {
  const issues: SupervisorIssue[] = [];
  const locales: Array<{ code: ContentLocale; content: StructuredContent | null }> = [
    { code: "es", content: p.contentEs },
    { code: "en", content: p.contentEn },
    { code: "fr", content: p.contentFr },
  ];

  // If no ES content yet, we haven't even paraphrased. That's not a content
  // issue — the supervisor should only run after paraphrase. Flag as info.
  if (!p.contentEs) {
    issues.push({
      category: "content",
      rule: "content-missing-es",
      severity: "info",
      field: "contentEs",
      message: "No hay contentEs (supervisor corrió antes de paraphrase?)",
    });
    return issues;
  }

  for (const { code, content } of locales) {
    if (!content) {
      if (code === "es") continue; // handled above
      issues.push({
        category: "content",
        rule: "content-missing-translation",
        severity: "warning",
        field: `content${code.toUpperCase()}`,
        locale: code,
        message: `Falta traducción ${code.toUpperCase()}`,
      });
      continue;
    }
    issues.push(...runRulesOnLocale(content, code, p));
  }

  return issues;
}

function runRulesOnLocale(
  content: StructuredContent,
  locale: ContentLocale,
  p: PropertyForSupervisor,
): SupervisorIssue[] {
  const issues: SupervisorIssue[] = [];

  const allText = concatAll(content);

  // --- Unresolved placeholders ---
  const placeholderMatches = allText.match(
    /\{\{(FACT|PII)_\d+\}\}/g,
  );
  if (placeholderMatches && placeholderMatches.length > 0) {
    issues.push({
      category: "content",
      rule: "unresolved-placeholders",
      severity: "error",
      locale,
      message: `${placeholderMatches.length} placeholders sin resolver: ${placeholderMatches.slice(0, 3).join(", ")}`,
      evidence: { placeholders: placeholderMatches.slice(0, 10) },
    });
  }

  // --- Forbidden marketing words ---
  const forbidden = detectForbidden(allText, locale);
  if (forbidden.length > 0) {
    issues.push({
      category: "content",
      rule: "forbidden-words-present",
      severity: "error",
      locale,
      message: `Palabras prohibidas detectadas: ${forbidden.join(", ")}`,
      evidence: { words: forbidden },
    });
  }

  // --- Word counts per block ---
  for (const [path, target] of Object.entries(WORD_COUNT_TARGETS)) {
    const text = readPath(content, path);
    const words = countWords(text);
    if (words < target.min) {
      issues.push({
        category: "content",
        rule: "word-count-low",
        severity: "error",
        field: path,
        locale,
        message: `${path} tiene ${words} palabras, mínimo ${target.min}`,
        evidence: { words, min: target.min, max: target.max },
      });
    } else if (words > target.max) {
      issues.push({
        category: "content",
        rule: "word-count-high",
        severity: "warning",
        field: path,
        locale,
        message: `${path} tiene ${words} palabras, máximo ${target.max}`,
        evidence: { words, min: target.min, max: target.max },
      });
    }
  }

  // --- FAQ count ---
  if (content.faq.length < 5) {
    issues.push({
      category: "content",
      rule: "faq-count-low",
      severity: "error",
      field: "faq",
      locale,
      message: `FAQ tiene ${content.faq.length} preguntas, mínimo 5`,
      evidence: { faqCount: content.faq.length },
    });
  } else if (content.faq.length > 8) {
    issues.push({
      category: "content",
      rule: "faq-count-high",
      severity: "warning",
      field: "faq",
      locale,
      message: `FAQ tiene ${content.faq.length} preguntas, máximo 8`,
      evidence: { faqCount: content.faq.length },
    });
  }

  // --- Meta lengths ---
  if (content.metaTitle.length > 60) {
    issues.push({
      category: "content",
      rule: "meta-title-too-long",
      severity: "warning",
      field: "metaTitle",
      locale,
      message: `metaTitle tiene ${content.metaTitle.length} chars (max 60)`,
      evidence: { length: content.metaTitle.length },
    });
  }
  if (
    content.metaDescription.length < 150 ||
    content.metaDescription.length > 160
  ) {
    issues.push({
      category: "content",
      rule: "meta-description-length-invalid",
      severity: "warning",
      field: "metaDescription",
      locale,
      message: `metaDescription tiene ${content.metaDescription.length} chars (target 150-160)`,
      evidence: { length: content.metaDescription.length },
    });
  }

  // --- Fallback detection: heroIntro copies source description prefix ---
  if (locale === "es") {
    const rawDesc = typeof p.rawData["descripcion"] === "string"
      ? (p.rawData["descripcion"] as string)
      : typeof p.rawData["description"] === "string"
      ? (p.rawData["description"] as string)
      : "";
    if (rawDesc.length > 150) {
      const rawPrefix = rawDesc.slice(0, 120).trim();
      const introPrefix = content.hero.intro.slice(0, 120).trim();
      if (
        introPrefix.length > 80 &&
        normalizeForCompare(introPrefix) === normalizeForCompare(rawPrefix)
      ) {
        issues.push({
          category: "content",
          rule: "hero-from-fallback",
          severity: "error",
          field: "hero.intro",
          locale,
          message:
            "heroIntro parece ser copia cruda del source (paraphrase entró en fallback)",
          evidence: { introPrefix, rawPrefix },
        });
      }
    }
  }

  // --- Specificity: number of concrete numeric tokens per 100 words ---
  const narrativeText = [
    content.hero.intro,
    content.features.body,
    content.location.body,
    content.lifestyle.body,
  ].join(" ");
  const narrativeWords = countWords(narrativeText);
  if (narrativeWords > 0) {
    const numericTokens =
      narrativeText.match(/\b\d+[.,]?\d*\s?(m2|m²|mts|km|min|recamaras?|ba[nñ]os?|usd|mxn|\$)/gi) ??
      [];
    const per100 = (numericTokens.length / narrativeWords) * 100;
    if (per100 < MIN_SPECIFICITY_PER_100_WORDS) {
      issues.push({
        category: "content",
        rule: "specificity-low",
        severity: "warning",
        locale,
        message: `Contenido con baja especificidad (${per100.toFixed(2)} cifras/100 palabras)`,
        evidence: {
          numericTokens: numericTokens.length,
          words: narrativeWords,
          per100,
        },
      });
    }
  }

  // --- Cross-block duplication (4-gram overlap) ---
  const blocks = [
    content.hero.intro,
    content.features.body,
    content.location.body,
    content.lifestyle.body,
  ];
  const overlap = maxPairwise4gramOverlap(blocks);
  if (overlap > MAX_NGRAM_OVERLAP) {
    issues.push({
      category: "content",
      rule: "blocks-duplicated",
      severity: "warning",
      locale,
      message: `Bloques repiten contenido (${(overlap * 100).toFixed(0)}% overlap de 4-gramas)`,
      evidence: { overlap },
    });
  }

  return issues;
}

function concatAll(content: StructuredContent): string {
  return [
    content.hero.h1,
    content.hero.intro,
    content.features.heading,
    content.features.body,
    content.location.heading,
    content.location.body,
    content.lifestyle.heading,
    content.lifestyle.body,
    content.metaTitle,
    content.metaDescription,
    ...content.faq.flatMap((f) => [f.question, f.answer]),
  ].join("\n");
}

function readPath(content: StructuredContent, path: string): string {
  switch (path) {
    case "hero.intro":
      return content.hero.intro;
    case "features.body":
      return content.features.body;
    case "location.body":
      return content.location.body;
    case "lifestyle.body":
      return content.lifestyle.body;
    default:
      return "";
  }
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ngrams(tokens: string[], n: number): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= tokens.length - n; i += 1) {
    set.add(tokens.slice(i, i + n).join(" "));
  }
  return set;
}

function maxPairwise4gramOverlap(blocks: string[]): number {
  const tokenLists = blocks.map((b) =>
    normalizeForCompare(b).split(" ").filter(Boolean),
  );
  const gramSets = tokenLists.map((t) => ngrams(t, 4));
  let max = 0;
  for (let i = 0; i < gramSets.length; i += 1) {
    for (let j = i + 1; j < gramSets.length; j += 1) {
      const a = gramSets[i];
      const b = gramSets[j];
      if (!a || !b || a.size === 0 || b.size === 0) continue;
      let shared = 0;
      for (const g of a) if (b.has(g)) shared += 1;
      const ratio = shared / Math.min(a.size, b.size);
      if (ratio > max) max = ratio;
    }
  }
  return max;
}

/** Exported helper for judge/scorer gating. */
export function hasUnresolvedPlaceholders(s: string): boolean {
  return PLACEHOLDER_RE.test(s);
}
