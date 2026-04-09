/** Classify page URLs into categories for routing.
 *
 * Strategy from PROJECT_CONSTITUTION.md:
 * - URL patterns (regex, free) → classification
 * - Negative filtering for non-listing pages
 */

export type PageType =
  | "sitemap"
  | "listing_index"
  | "property_detail"
  | "skip";

const PROPERTY_PATTERNS = [
  /\/propiedad\//i,
  /\/inmueble\//i,
  /\/listing\//i,
  /\/property\//i,
  /\/venta\/[^/]+\/[^/]+$/i,
  /\/renta\/[^/]+\/[^/]+$/i,
  /\/en-venta\//i,
  /\/en-renta\//i,
];

const LISTING_INDEX_PATTERNS = [
  /\/propiedades/i,
  /\/inmuebles/i,
  /\/listings/i,
  /\/properties/i,
  /\/search/i,
  /\/resultados/i,
  /\/venta\/?$/i,
  /\/renta\/?$/i,
  /\/departamentos/i,
  /\/casas/i,
  /\/status\//i,
  /\/estatus\//i,
  /\/type\//i,
  /\/city\//i,
  /\/label\//i,
];

const SKIP_PATTERNS = [
  /\/about/i,
  /\/contact/i,
  /\/blog/i,
  /\/news/i,
  /\/careers/i,
  /\/privacy/i,
  /\/terms/i,
  /\/faq/i,
  /\/login/i,
  /\/register/i,
  /\/admin/i,
  /\/wp-admin/i,
  /\/wp-login/i,
  /\.(pdf|jpg|jpeg|png|gif|svg|css|js)$/i,
];

const SITEMAP_PATTERNS = [
  /sitemap.*\.xml/i,
  /wp-sitemap/i,
];

export function classifyUrl(url: string): PageType {
  const path = new URL(url).pathname;

  if (SITEMAP_PATTERNS.some((p) => p.test(path))) {
    return "sitemap";
  }

  if (SKIP_PATTERNS.some((p) => p.test(path))) {
    return "skip";
  }

  if (PROPERTY_PATTERNS.some((p) => p.test(path))) {
    return "property_detail";
  }

  if (LISTING_INDEX_PATTERNS.some((p) => p.test(path))) {
    return "listing_index";
  }

  return "skip";
}

/** Check if a URL matches listing-related patterns (for link following) */
export function isListingRelated(url: string): boolean {
  const type = classifyUrl(url);
  return type === "property_detail" || type === "listing_index";
}
