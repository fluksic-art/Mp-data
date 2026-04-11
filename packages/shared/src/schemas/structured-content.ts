/** Structured content shape produced by the paraphrase + translate workers.
 *
 * Per the Propyte Manual de Descripciones (Parte 1.2 — 8 bloques adaptado).
 * We use 5 bloques realistas porque el manual pide datos (cap rate, distancias
 * exactas, historial de developer) que NO tenemos en la fuente y no podemos
 * fabricar sin violar P1.
 *
 * The same shape is used for `content_es`, `content_en` and `content_fr` JSONB
 * columns. `contentVersion` lets the page renderer detect legacy single-string
 * descriptions vs the new structured format during the transition.
 */

export interface StructuredFaq {
  question: string;
  answer: string;
}

export interface StructuredBlock {
  heading: string;
  body: string;
}

export interface StructuredContent {
  /** Discriminator for legacy vs new format. Always 2 for new content. */
  contentVersion: 2;

  /** Reescritura del título para H1 / cards */
  hero: {
    h1: string;
    /** Lifestyle intro, ~150-200 palabras, párrafos cortos */
    intro: string;
  };

  /** Características y acabados — ~150-200 palabras */
  features: StructuredBlock;

  /** Ubicación y zona — ~150-200 palabras (sin inventar distancias) */
  location: StructuredBlock;

  /** Lifestyle y experiencia — ~100-150 palabras */
  lifestyle: StructuredBlock;

  /** 5-8 preguntas frecuentes con respuestas de 40-60 palabras */
  faq: StructuredFaq[];

  /** SEO meta title — < 60 chars */
  metaTitle: string;

  /** SEO meta description — 150-160 chars con precio + CTA garantizado */
  metaDescription: string;
}

/** Type guard: check if a JSONB content blob is the new structured format */
export function isStructuredContent(
  value: unknown,
): value is StructuredContent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v["contentVersion"] === 2 &&
    typeof v["hero"] === "object" &&
    typeof v["features"] === "object" &&
    typeof v["location"] === "object" &&
    typeof v["lifestyle"] === "object" &&
    Array.isArray(v["faq"])
  );
}
