/** Closed enum of descriptive adjectives used in the URL slug.
 *
 * Picked by the Tier 3 extractor (LLM via tool_use with enum constraint)
 * and stored in `properties.slug_adjective` as a canonical ES key. Slug
 * generation translates the key per-locale for hreflang URLs.
 *
 * Why a closed enum: the adjective must be stable across re-extraction
 * runs, predictable for SEO, and small enough to avoid long-tail spam.
 * If none of the values clearly applies, the value is `null` and the
 * slug falls back to `{type}-{city}-{id8}`.
 */

export const SLUG_ADJECTIVE_KEYS = [
  "frente-al-mar",
  "vista-al-mar",
  "con-alberca",
  "con-rooftop",
  "privado",
  "amueblado",
  "de-lujo",
  "boutique",
  "penthouse",
  "familiar",
] as const;

export type SlugAdjectiveKey = (typeof SLUG_ADJECTIVE_KEYS)[number];

export const SLUG_ADJECTIVE_TRANSLATIONS: Record<
  SlugAdjectiveKey,
  { es: string; en: string; fr: string }
> = {
  "frente-al-mar": { es: "frente-al-mar", en: "beachfront", fr: "front-de-mer" },
  "vista-al-mar": { es: "vista-al-mar", en: "sea-view", fr: "vue-sur-mer" },
  "con-alberca": { es: "con-alberca", en: "with-pool", fr: "avec-piscine" },
  "con-rooftop": { es: "con-rooftop", en: "with-rooftop", fr: "avec-rooftop" },
  "privado": { es: "privado", en: "private", fr: "prive" },
  "amueblado": { es: "amueblado", en: "furnished", fr: "meuble" },
  "de-lujo": { es: "de-lujo", en: "luxury", fr: "luxury" },
  "boutique": { es: "boutique", en: "boutique", fr: "boutique" },
  "penthouse": { es: "penthouse", en: "penthouse", fr: "penthouse" },
  "familiar": { es: "familiar", en: "family", fr: "familial" },
};

/** Type guard: is this value a valid SlugAdjectiveKey? */
export function isSlugAdjectiveKey(value: unknown): value is SlugAdjectiveKey {
  return (
    typeof value === "string" &&
    (SLUG_ADJECTIVE_KEYS as readonly string[]).includes(value)
  );
}

/** Translate a slug adjective key into its per-locale form.
 * Returns null if the input key is null (no adjective).
 */
export function translateAdjective(
  key: SlugAdjectiveKey | null,
  locale: "es" | "en" | "fr",
): string | null {
  if (!key) return null;
  return SLUG_ADJECTIVE_TRANSLATIONS[key][locale];
}
