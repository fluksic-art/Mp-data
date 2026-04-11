/** Meta tag templates per locale.
 *
 * Per constitution: NO hardcoded SEO keywords. These are templates
 * that fill in dynamic data from typed DB columns + content fields.
 *
 * Title: 50-60 chars (Google truncates beyond)
 * Description: 120-160 chars
 */

interface MetaInputs {
  title: string;
  city: string;
  state: string;
  propertyType: string;
  listingType: string;
  priceCents: number | null;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  constructionM2: number | null;
}

interface MetaOutput {
  title: string;
  description: string;
  h1: string;
}

/** Type label translations */
const TYPE_LABELS = {
  es: {
    apartment_sale: "Departamento en venta",
    apartment_rent: "Departamento en renta",
    apartment_presale: "Departamento en preventa",
    house_sale: "Casa en venta",
    house_rent: "Casa en renta",
    house_presale: "Casa en preventa",
    villa_sale: "Villa en venta",
    villa_rent: "Villa en renta",
    villa_presale: "Villa en preventa",
    penthouse_sale: "Penthouse en venta",
    penthouse_rent: "Penthouse en renta",
    penthouse_presale: "Penthouse en preventa",
    land_sale: "Terreno en venta",
    land_rent: "Terreno en renta",
    land_presale: "Terreno en preventa",
    office_sale: "Oficina en venta",
    office_rent: "Oficina en renta",
    office_presale: "Oficina en preventa",
    commercial_sale: "Local en venta",
    commercial_rent: "Local en renta",
    commercial_presale: "Local en preventa",
  },
  en: {
    apartment_sale: "Apartment for sale",
    apartment_rent: "Apartment for rent",
    apartment_presale: "Apartment pre-construction",
    house_sale: "House for sale",
    house_rent: "House for rent",
    house_presale: "House pre-construction",
    villa_sale: "Villa for sale",
    villa_rent: "Villa for rent",
    villa_presale: "Villa pre-construction",
    penthouse_sale: "Penthouse for sale",
    penthouse_rent: "Penthouse for rent",
    penthouse_presale: "Penthouse pre-construction",
    land_sale: "Land for sale",
    land_rent: "Land for rent",
    land_presale: "Land pre-construction",
    office_sale: "Office for sale",
    office_rent: "Office for rent",
    office_presale: "Office pre-construction",
    commercial_sale: "Commercial for sale",
    commercial_rent: "Commercial for rent",
    commercial_presale: "Commercial pre-construction",
  },
  fr: {
    apartment_sale: "Appartement à vendre",
    apartment_rent: "Appartement à louer",
    apartment_presale: "Appartement en prévente",
    house_sale: "Maison à vendre",
    house_rent: "Maison à louer",
    house_presale: "Maison en prévente",
    villa_sale: "Villa à vendre",
    villa_rent: "Villa à louer",
    villa_presale: "Villa en prévente",
    penthouse_sale: "Penthouse à vendre",
    penthouse_rent: "Penthouse à louer",
    penthouse_presale: "Penthouse en prévente",
    land_sale: "Terrain à vendre",
    land_rent: "Terrain à louer",
    land_presale: "Terrain en prévente",
    office_sale: "Bureau à vendre",
    office_rent: "Bureau à louer",
    office_presale: "Bureau en prévente",
    commercial_sale: "Local à vendre",
    commercial_rent: "Local à louer",
    commercial_presale: "Local en prévente",
  },
} as const;

/** Format a price for display (locale-aware) */
function formatPrice(
  cents: number,
  currency: string,
  locale: "es" | "en" | "fr",
): string {
  const amount = cents / 100;
  const localeMap = { es: "es-MX", en: "en-US", fr: "fr-FR" };
  const formatted = amount.toLocaleString(localeMap[locale], {
    maximumFractionDigits: 0,
  });
  return `${currency} ${formatted}`;
}

/** Get type label, with fallback */
function getTypeLabel(
  locale: "es" | "en" | "fr",
  propertyType: string,
  listingType: string,
): string {
  const key = `${propertyType}_${listingType}` as keyof (typeof TYPE_LABELS)["es"];
  return TYPE_LABELS[locale][key] ?? TYPE_LABELS[locale].apartment_sale;
}

/** Build meta tags for a single listing page in a given locale */
export function buildListingMeta(
  inputs: MetaInputs,
  locale: "es" | "en" | "fr",
  brand: string = "MPgenesis",
): MetaOutput {
  const typeLabel = getTypeLabel(locale, inputs.propertyType, inputs.listingType);
  const priceStr = inputs.priceCents
    ? formatPrice(inputs.priceCents, inputs.currency, locale)
    : "";

  // Title: "{TypeLabel} en {City} - {Price} | {Brand}" (target 50-60 chars)
  const titlePrice = priceStr ? ` - ${priceStr}` : "";
  const titleBase = `${typeLabel} en ${inputs.city}${titlePrice}`;
  const titleWithBrand = `${titleBase} | ${brand}`;
  const title =
    titleWithBrand.length <= 60 ? titleWithBrand : titleBase.slice(0, 60);

  // Description per Propyte Manual Parte 5.4:
  // [verbo acción] + [tipo+recs] + [ubicación] + [precio] + [CTA]
  // Price and CTA are SACRED — trim location first, then bedrooms, never CTA/price.
  // Target: 150-160 chars.
  const description = buildDescription(locale, typeLabel, inputs, priceStr);

  // H1: typeLabel + city + (bedrooms suffix when present)
  const inWord = locale === "es" ? "en" : locale === "en" ? "in" : "à";
  const bedSuffix = inputs.bedrooms
    ? ` - ${inputs.bedrooms} ${
        locale === "es"
          ? "recámaras"
          : locale === "en"
            ? "bedrooms"
            : "chambres"
      }`
    : "";
  const h1 = `${typeLabel} ${inWord} ${inputs.city}${bedSuffix}`;

  return { title, description, h1 };
}

/** Per-locale meta description builder.
 *
 * Hard contract: price (if available) and CTA always survive trimming.
 * Truncation order: full → drop state → drop full location → drop bedroom
 * fragment → final hard slice.
 */
function buildDescription(
  locale: "es" | "en" | "fr",
  typeLabel: string,
  inputs: MetaInputs,
  priceStr: string,
): string {
  const lowerType = typeLabel.toLowerCase();
  const cta =
    locale === "es"
      ? "Agenda tu visita."
      : locale === "en"
        ? "Schedule a tour."
        : "Planifiez une visite.";
  const fromWord =
    locale === "es" ? "Desde" : locale === "en" ? "From" : "À partir de";
  const priceFragment = priceStr ? `${fromWord} ${priceStr}.` : "";

  const verb =
    locale === "es" ? "Descubre" : locale === "en" ? "Discover" : "Découvrez";

  // Per-locale lead variants:
  // - withBeds: includes bedroom count
  // - noBeds:   omits bedrooms
  let withBeds: string;
  let noBeds: string;
  if (locale === "es") {
    const beds = inputs.bedrooms
      ? ` de ${inputs.bedrooms} ${inputs.bedrooms === 1 ? "recámara" : "recámaras"}`
      : "";
    withBeds = `${verb} este ${lowerType}${beds}`;
    noBeds = `${verb} este ${lowerType}`;
  } else if (locale === "en") {
    const bedPrefix = inputs.bedrooms
      ? `${inputs.bedrooms}-${inputs.bedrooms === 1 ? "bedroom" : "bedroom"} `
      : "";
    // "Discover this 3-bedroom apartment for sale" — bedroom prefix sits before
    // the property type label. Note: "bedroom" stays singular when used as a
    // compound modifier (e.g. "3-bedroom apartment"), per AP style.
    withBeds = `${verb} this ${bedPrefix}${lowerType}`;
    noBeds = `${verb} this ${lowerType}`;
  } else {
    const beds = inputs.bedrooms
      ? ` de ${inputs.bedrooms} ${inputs.bedrooms === 1 ? "chambre" : "chambres"}`
      : "";
    withBeds = `${verb} ce ${lowerType}${beds}`;
    noBeds = `${verb} ce ${lowerType}`;
  }

  const inWord = locale === "es" ? "en" : locale === "en" ? "in" : "à";
  const fullLocation = `${inWord} ${inputs.city}, ${inputs.state}`;
  const shortLocation = `${inWord} ${inputs.city}`;

  const compose = (lead: string, location: string): string => {
    let s = `${lead} ${location}.`;
    if (priceFragment) s += ` ${priceFragment}`;
    s += ` ${cta}`;
    return s;
  };

  const candidates = [
    compose(withBeds, fullLocation),
    compose(withBeds, shortLocation),
    compose(noBeds, fullLocation),
    compose(noBeds, shortLocation),
    `${noBeds}.${priceFragment ? ` ${priceFragment}` : ""} ${cta}`,
  ];

  for (const candidate of candidates) {
    if (candidate.length <= 160) return candidate;
  }
  // Last resort: hard slice the most-trimmed candidate
  const last = candidates[candidates.length - 1] ?? "";
  return last.slice(0, 160);
}

/** Build meta tags for a hub page (city + property type listing) */
export function buildHubMeta(
  city: string,
  state: string,
  propertyType: string,
  listingType: string,
  count: number,
  locale: "es" | "en" | "fr",
  brand: string = "MPgenesis",
): MetaOutput {
  const typeLabel = getTypeLabel(locale, propertyType, listingType);

  // Title: "{TypeLabel} en {city}, {state} ({N}+) | {Brand}"
  const title = `${typeLabel} en ${city}, ${state} (${count}+) | ${brand}`.slice(0, 60);

  // Description
  const findWord =
    locale === "es"
      ? "Encuentra"
      : locale === "en"
        ? "Find"
        : "Trouvez";
  const inWord = locale === "es" ? "en" : locale === "en" ? "in" : "à";

  const description =
    `${findWord} ${count}+ ${typeLabel.toLowerCase()} ${inWord} ${city}, ${state}. ${
      locale === "es"
        ? "Precios actualizados, fotos, mapas y contacto directo."
        : locale === "en"
          ? "Updated prices, photos, maps and direct contact."
          : "Prix actualisés, photos, cartes et contact direct."
    }`.slice(0, 160);

  const h1 = `${typeLabel} ${inWord} ${city}, ${state}`;

  return { title, description, h1 };
}
