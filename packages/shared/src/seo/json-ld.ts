/** Schema.org RealEstateListing JSON-LD generator.
 *
 * Per constitution: every published listing emits structured data
 * to maximize organic CTR (15-30% increase per the docs).
 *
 * P1 compliance: only typed factual columns are used. No LLM data
 * touches the schema markup.
 */

import {
  translateAdjective,
  type SlugAdjectiveKey,
} from "./slug-adjectives.js";

export interface PropertyForSchema {
  id: string;
  title: string;
  propertyType: string;
  listingType: string;
  priceCents: number | null;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  constructionM2: number | null;
  landM2: number | null;
  country: string;
  state: string;
  city: string;
  neighborhood: string | null;
  address: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceUrl: string;
}

export interface SchemaOrgImage {
  url: string;
  width?: number;
  height?: number;
}

/** Map our property types to Schema.org @type values */
function mapPropertyTypeToSchemaType(propertyType: string): string {
  const map: Record<string, string> = {
    apartment: "Apartment",
    house: "House",
    villa: "House",
    penthouse: "Apartment",
    land: "Place",
    office: "LocalBusiness",
    commercial: "LocalBusiness",
  };
  return map[propertyType] ?? "Residence";
}

/** Generate the canonical URL for a listing in a given locale */
export function buildListingUrl(
  baseUrl: string,
  locale: "es" | "en" | "fr",
  state: string,
  city: string,
  propertyType: string,
  listingType: string,
  slug: string,
): string {
  const segments = LOCALE_SEGMENTS[locale];
  const typeKey = `${propertyType}_${listingType}` as keyof typeof segments.types;
  const typeSegment = segments.types[typeKey] ?? segments.types.apartment_sale;
  const stateSlug = slugify(state);
  const citySlug = slugify(city);
  return `${baseUrl}/${locale}/${stateSlug}/${citySlug}/${typeSegment}/${slug}/`;
}

const LOCALE_SEGMENTS = {
  es: {
    types: {
      apartment_sale: "departamentos-en-venta",
      apartment_rent: "departamentos-en-renta",
      apartment_presale: "departamentos-en-preventa",
      house_sale: "casas-en-venta",
      house_rent: "casas-en-renta",
      house_presale: "casas-en-preventa",
      villa_sale: "villas-en-venta",
      villa_rent: "villas-en-renta",
      villa_presale: "villas-en-preventa",
      penthouse_sale: "penthouses-en-venta",
      penthouse_rent: "penthouses-en-renta",
      penthouse_presale: "penthouses-en-preventa",
      land_sale: "terrenos-en-venta",
      land_rent: "terrenos-en-renta",
      land_presale: "terrenos-en-preventa",
      office_sale: "oficinas-en-venta",
      office_rent: "oficinas-en-renta",
      office_presale: "oficinas-en-preventa",
      commercial_sale: "locales-en-venta",
      commercial_rent: "locales-en-renta",
      commercial_presale: "locales-en-preventa",
    },
  },
  en: {
    types: {
      apartment_sale: "apartments-for-sale",
      apartment_rent: "apartments-for-rent",
      apartment_presale: "apartments-pre-construction",
      house_sale: "houses-for-sale",
      house_rent: "houses-for-rent",
      house_presale: "houses-pre-construction",
      villa_sale: "villas-for-sale",
      villa_rent: "villas-for-rent",
      villa_presale: "villas-pre-construction",
      penthouse_sale: "penthouses-for-sale",
      penthouse_rent: "penthouses-for-rent",
      penthouse_presale: "penthouses-pre-construction",
      land_sale: "land-for-sale",
      land_rent: "land-for-rent",
      land_presale: "land-pre-construction",
      office_sale: "offices-for-sale",
      office_rent: "offices-for-rent",
      office_presale: "offices-pre-construction",
      commercial_sale: "commercial-for-sale",
      commercial_rent: "commercial-for-rent",
      commercial_presale: "commercial-pre-construction",
    },
  },
  fr: {
    types: {
      apartment_sale: "appartements-a-vendre",
      apartment_rent: "appartements-a-louer",
      apartment_presale: "appartements-en-prevente",
      house_sale: "maisons-a-vendre",
      house_rent: "maisons-a-louer",
      house_presale: "maisons-en-prevente",
      villa_sale: "villas-a-vendre",
      villa_rent: "villas-a-louer",
      villa_presale: "villas-en-prevente",
      penthouse_sale: "penthouses-a-vendre",
      penthouse_rent: "penthouses-a-louer",
      penthouse_presale: "penthouses-en-prevente",
      land_sale: "terrains-a-vendre",
      land_rent: "terrains-a-louer",
      land_presale: "terrains-en-prevente",
      office_sale: "bureaux-a-vendre",
      office_rent: "bureaux-a-louer",
      office_presale: "bureaux-en-prevente",
      commercial_sale: "locaux-a-vendre",
      commercial_rent: "locaux-a-louer",
      commercial_presale: "locaux-en-prevente",
    },
  },
} as const;

/** Per-locale property type segment used in the URL slug prefix.
 * Intentionally NOT the same as the listingType segment (which lives
 * earlier in the URL path).
 */
const PROPERTY_TYPE_SLUG: Record<
  "es" | "en" | "fr",
  Record<string, string>
> = {
  es: {
    apartment: "departamento",
    house: "casa",
    villa: "villa",
    penthouse: "penthouse",
    land: "terreno",
    office: "oficina",
    commercial: "local",
  },
  en: {
    apartment: "apartment",
    house: "house",
    villa: "villa",
    penthouse: "penthouse",
    land: "land",
    office: "office",
    commercial: "commercial",
  },
  fr: {
    apartment: "appartement",
    house: "maison",
    villa: "villa",
    penthouse: "penthouse",
    land: "terrain",
    office: "bureau",
    commercial: "local",
  },
};

/** Build the anonymized URL slug for a listing.
 *
 * Structure: `{type}-{city}-{adjective}-{idPrefix}` (adjective optional).
 * Uses NO proper names (no developer_name, no development_name) so the
 * URL bar cannot be used to bypass the marketplace.
 *
 * `findPropertyBySlug()` only looks at the last 8 chars (idPrefix), so
 * old slugs with the dev name still resolve — the new slug is canonical
 * for the sitemap and hreflang.
 */
export function buildListingSlug(params: {
  propertyType: string;
  city: string;
  slugAdjective: SlugAdjectiveKey | null;
  idPrefix: string;
  locale: "es" | "en" | "fr";
}): string {
  const typeLabel =
    PROPERTY_TYPE_SLUG[params.locale][params.propertyType] ??
    params.propertyType;
  const citySlug = slugify(params.city);
  const adj = translateAdjective(params.slugAdjective, params.locale);
  const parts = [typeLabel, citySlug];
  if (adj) parts.push(adj);
  parts.push(params.idPrefix);
  return parts.filter(Boolean).join("-");
}

/** Generate a URL-safe slug from arbitrary text */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/['']/g, "") // strip apostrophes
    .replace(/[^a-z0-9\s-]/g, "") // strip special chars
    .replace(/\s+/g, "-") // spaces to dashes
    .replace(/-+/g, "-") // collapse dashes
    .replace(/^-|-$/g, "") // trim dashes
    .slice(0, 80);
}

/** Build the Schema.org JSON-LD for a single property listing */
export function buildPropertyJsonLd(
  property: PropertyForSchema,
  options: {
    canonicalUrl: string;
    locale: "es" | "en" | "fr";
    images: SchemaOrgImage[];
    description: string;
  },
): Record<string, unknown> {
  const { canonicalUrl, locale, images, description } = options;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: property.title,
    description,
    url: canonicalUrl,
    inLanguage: locale,
    image: images.map((img) => img.url),
  };

  // Offer (price)
  if (property.priceCents != null) {
    schema["offers"] = {
      "@type": "Offer",
      price: String(property.priceCents / 100),
      priceCurrency: property.currency,
      availability: "https://schema.org/InStock",
    };
  }

  // Address
  schema["address"] = {
    "@type": "PostalAddress",
    addressCountry: property.country,
    addressRegion: property.state,
    addressLocality: property.city,
    ...(property.neighborhood && { addressLocality: property.neighborhood }),
    ...(property.address && { streetAddress: property.address }),
    ...(property.postalCode && { postalCode: property.postalCode }),
  };

  // Geo coordinates
  if (property.latitude != null && property.longitude != null) {
    schema["geo"] = {
      "@type": "GeoCoordinates",
      latitude: property.latitude,
      longitude: property.longitude,
    };
  }

  // Floor size
  if (property.constructionM2 != null) {
    schema["floorSize"] = {
      "@type": "QuantitativeValue",
      value: property.constructionM2,
      unitCode: "MTK", // square meters
    };
  }

  // Lot size
  if (property.landM2 != null) {
    schema["lotSize"] = {
      "@type": "QuantitativeValue",
      value: property.landM2,
      unitCode: "MTK",
    };
  }

  // Rooms
  if (property.bedrooms != null) {
    schema["numberOfBedrooms"] = property.bedrooms;
  }
  if (property.bathrooms != null) {
    schema["numberOfBathroomsTotal"] = property.bathrooms;
  }

  // Property type sub-classification
  schema["additionalType"] = mapPropertyTypeToSchemaType(property.propertyType);

  return schema;
}

/** Build BreadcrumbList JSON-LD for a property page */
export function buildBreadcrumbJsonLd(
  baseUrl: string,
  locale: "es" | "en" | "fr",
  property: Pick<PropertyForSchema, "state" | "city" | "title">,
  canonicalUrl: string,
): Record<string, unknown> {
  const stateSlug = slugify(property.state);
  const citySlug = slugify(property.city);
  const labels = BREADCRUMB_LABELS[locale];

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: labels.home,
        item: `${baseUrl}/${locale}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: property.state,
        item: `${baseUrl}/${locale}/${stateSlug}/`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: property.city,
        item: `${baseUrl}/${locale}/${stateSlug}/${citySlug}/`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: property.title,
        item: canonicalUrl,
      },
    ],
  };
}

const BREADCRUMB_LABELS = {
  es: { home: "Inicio" },
  en: { home: "Home" },
  fr: { home: "Accueil" },
} as const;

/** Build FAQPage JSON-LD from a list of question/answer pairs.
 *
 * Per Propyte Manual Parte 5.1: even though Google restricts FAQ rich
 * results to authoritative sites, the schema still helps citations in
 * AI tools and matches People Also Ask intent.
 */
export function buildFaqJsonLd(
  faqs: Array<{ question: string; answer: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };
}

/** Build hreflang link tags as data (for use in Next.js metadata) */
export function buildHreflangLinks(
  baseUrl: string,
  locales: { locale: "es" | "en" | "fr"; url: string }[],
  defaultLocale: "es" | "en" | "fr" = "es",
): Array<{ rel: "alternate"; hrefLang: string; href: string }> {
  const links = locales.map((l) => ({
    rel: "alternate" as const,
    hrefLang: l.locale === "es" ? "es-mx" : l.locale,
    href: l.url,
  }));

  // x-default points to the default locale (Spanish for Mexico market)
  const defaultEntry = locales.find((l) => l.locale === defaultLocale);
  if (defaultEntry) {
    links.push({
      rel: "alternate",
      hrefLang: "x-default",
      href: defaultEntry.url,
    });
  }

  return links;
}
