export type FixActionKind =
  | "reprocess_paraphrase"
  | "retranslate"
  | "re_enrich"
  | "data_patch"
  | "bulk_status";

export interface FixActionDef {
  kind: FixActionKind;
  label: string;
  description: string;
  needsParams: boolean;
}

export const RULE_FIX_MAP: Record<string, FixActionDef> = {
  // Content quality → re-paraphrase (clears ES/EN/FR, re-enqueues paraphrase)
  "word-count-low": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera contenido ES + traducciones",
    needsParams: false,
  },
  "word-count-high": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera contenido ES + traducciones",
    needsParams: false,
  },
  "hero-from-fallback": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera hero desde descripción completa",
    needsParams: false,
  },
  "specificity-low": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera con mayor especificidad",
    needsParams: false,
  },
  "blocks-duplicated": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera para eliminar bloques duplicados",
    needsParams: false,
  },
  "forbidden-words-present": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera sin palabras prohibidas",
    needsParams: false,
  },
  "faq-count-low": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera con más FAQs",
    needsParams: false,
  },
  "faq-count-high": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera con menos FAQs",
    needsParams: false,
  },
  "meta-title-too-long": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera meta title más corto",
    needsParams: false,
  },
  "meta-description-length-invalid": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera meta description con largo válido",
    needsParams: false,
  },
  "unresolved-placeholders": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera resolviendo placeholders",
    needsParams: false,
  },
  // LLM judge content rules (dynamic names) — common ones
  "empty-sell-style": {
    kind: "reprocess_paraphrase",
    label: "Re-parafrasear",
    description: "Regenera con estilo de venta mejorado",
    needsParams: false,
  },

  // Translation issues → retranslate only (keeps ES, regenerates EN/FR)
  "content-missing-translation": {
    kind: "retranslate",
    label: "Re-traducir",
    description: "Regenera EN/FR desde contenido ES existente",
    needsParams: false,
  },

  // Factual data issues → re-enrich from source
  "coords-outside-state": {
    kind: "re_enrich",
    label: "Re-extraer",
    description: "Re-fetch de la fuente para corregir coordenadas",
    needsParams: false,
  },
  "bedrooms-required-missing": {
    kind: "re_enrich",
    label: "Re-extraer",
    description: "Re-fetch de la fuente para obtener recámaras",
    needsParams: false,
  },
  "price-zero-or-missing": {
    kind: "re_enrich",
    label: "Re-extraer",
    description: "Re-fetch de la fuente para obtener precio",
    needsParams: false,
  },
  "city-missing": {
    kind: "re_enrich",
    label: "Re-extraer",
    description: "Re-fetch de la fuente para obtener ciudad",
    needsParams: false,
  },
  "state-missing": {
    kind: "re_enrich",
    label: "Re-extraer",
    description: "Re-fetch de la fuente para obtener estado",
    needsParams: false,
  },
};

export function getFixForRule(rule: string): FixActionDef | null {
  return RULE_FIX_MAP[rule] ?? null;
}
