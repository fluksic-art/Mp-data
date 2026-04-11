import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { properties } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import {
  buildPropertyJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildListingUrl,
  buildListingMeta,
  buildListingSlug,
  isSlugAdjectiveKey,
  isStructuredContent,
  type StructuredContent,
  type SlugAdjectiveKey,
} from "@mpgenesis/shared";
import { LeadForm, WhatsAppCTA } from "@/components/lead-form";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const BASE_URL = process.env["NEXT_PUBLIC_BASE_URL"] ?? "http://localhost:3000";
const VALID_LOCALES = ["es", "en", "fr"] as const;
type Locale = (typeof VALID_LOCALES)[number];

interface PageParams {
  locale: string;
  state: string;
  city: string;
  type: string;
  slug: string;
}

/** Lookup a property by URL slug — slug ends with the first 8 chars of UUID */
async function findPropertyBySlug(slug: string) {
  const idPrefix = slug.slice(-8);
  if (idPrefix.length < 8) return null;

  const db = getDb();
  const all = await db
    .select()
    .from(properties)
    .where(eq(properties.status, "published"));

  return all.find((p) => p.id.startsWith(idPrefix)) ?? null;
}

function isValidLocale(locale: string): locale is Locale {
  return (VALID_LOCALES as readonly string[]).includes(locale);
}

/** Locale-aware section labels (used for legacy + structured content fallback). */
const LABELS = {
  es: {
    description: "Descripción",
    features: "Características",
    location: "Ubicación",
    lifestyle: "Lifestyle",
    faq: "Preguntas frecuentes",
    gallery: "Galería",
    bedrooms: "Recámaras",
    bathrooms: "Baños",
    construction: "Construcción",
    land: "Terreno",
    price: "Precio",
  },
  en: {
    description: "Description",
    features: "Features",
    location: "Location",
    lifestyle: "Lifestyle",
    faq: "Frequently asked questions",
    gallery: "Gallery",
    bedrooms: "Bedrooms",
    bathrooms: "Bathrooms",
    construction: "Construction",
    land: "Land",
    price: "Price",
  },
  fr: {
    description: "Description",
    features: "Caractéristiques",
    location: "Emplacement",
    lifestyle: "Art de vivre",
    faq: "Questions fréquentes",
    gallery: "Galerie",
    bedrooms: "Chambres",
    bathrooms: "Sdb",
    construction: "Construction",
    land: "Terrain",
    price: "Prix",
  },
} as const;

function getContentForLocale(
  property: typeof properties.$inferSelect,
  locale: Locale,
): unknown {
  if (locale === "es") return property.contentEs;
  if (locale === "en") return property.contentEn;
  return property.contentFr;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) return {};

  const property = await findPropertyBySlug(slug);
  if (!property) return {};

  const content = getContentForLocale(property, locale);

  // Prefer structured content (v2). Fall back to legacy single-string format,
  // and finally to the meta-template helper.
  let metaTitle: string;
  let metaDescription: string;
  if (isStructuredContent(content)) {
    metaTitle = content.metaTitle;
    metaDescription = content.metaDescription;
  } else if (
    content &&
    typeof content === "object" &&
    "metaTitle" in content
  ) {
    const legacy = content as Record<string, string>;
    metaTitle = legacy["metaTitle"] ?? "";
    metaDescription = legacy["metaDescription"] ?? "";
  } else {
    const tpl = buildListingMeta(
      {
        title: property.title,
        city: property.city,
        state: property.state,
        propertyType: property.propertyType,
        listingType: property.listingType,
        priceCents: property.priceCents,
        currency: property.currency,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        constructionM2: property.constructionM2,
      },
      locale,
    );
    metaTitle = tpl.title;
    metaDescription = tpl.description;
  }

  const slugAdjective = isSlugAdjectiveKey(property.slugAdjective)
    ? property.slugAdjective
    : null;
  const idPrefix = property.id.slice(0, 8);
  const slugFor = (l: Locale): string =>
    buildListingSlug({
      propertyType: property.propertyType,
      city: property.city,
      slugAdjective,
      idPrefix,
      locale: l,
    });

  const alternates = Object.fromEntries(
    VALID_LOCALES.map((l) => [
      l === "es" ? "es-mx" : l,
      buildListingUrl(
        BASE_URL,
        l,
        property.state,
        property.city,
        property.propertyType,
        property.listingType,
        slugFor(l),
      ),
    ]),
  );

  const canonical = buildListingUrl(
    BASE_URL,
    locale,
    property.state,
    property.city,
    property.propertyType,
    property.listingType,
    slugFor(locale),
  );

  return {
    title: metaTitle,
    description: metaDescription,
    alternates: {
      canonical,
      languages: { ...alternates, "x-default": alternates["es-mx"]! },
    },
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      url: canonical,
      locale: locale === "es" ? "es_MX" : locale === "en" ? "en_US" : "fr_FR",
      type: "website",
    },
  };
}

export default async function PublicListingPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) notFound();

  const property = await findPropertyBySlug(slug);
  if (!property) notFound();

  const labels = LABELS[locale];

  const rawContent = getContentForLocale(property, locale);
  const structured = isStructuredContent(rawContent) ? rawContent : null;
  const legacyContent =
    !structured && rawContent && typeof rawContent === "object"
      ? (rawContent as Record<string, string>)
      : null;

  // Resolve display values: structured > legacy > template
  const fallbackTpl = buildListingMeta(
    {
      title: property.title,
      city: property.city,
      state: property.state,
      propertyType: property.propertyType,
      listingType: property.listingType,
      priceCents: property.priceCents,
      currency: property.currency,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      constructionM2: property.constructionM2,
    },
    locale,
  );
  const displayH1 =
    structured?.hero.h1 ?? legacyContent?.["h1"] ?? fallbackTpl.h1;
  const displayTitle =
    structured?.metaTitle ?? legacyContent?.["title"] ?? fallbackTpl.title;
  const metaDescriptionForJsonLd =
    structured?.metaDescription ??
    legacyContent?.["metaDescription"] ??
    fallbackTpl.description;

  // Build canonical URL — anonimato: slug never contains developer/development
  // name, just tipo + ciudad + adjetivo + id8.
  const slugAdjectiveKey: SlugAdjectiveKey | null = isSlugAdjectiveKey(
    property.slugAdjective,
  )
    ? property.slugAdjective
    : null;
  const canonicalSlug = buildListingSlug({
    propertyType: property.propertyType,
    city: property.city,
    slugAdjective: slugAdjectiveKey,
    idPrefix: property.id.slice(0, 8),
    locale,
  });
  const canonicalUrl = buildListingUrl(
    BASE_URL,
    locale,
    property.state,
    property.city,
    property.propertyType,
    property.listingType,
    canonicalSlug,
  );

  // Get images from raw_data — P1: facts via typed/raw columns, never LLM
  const rawData = property.rawData as Record<string, unknown>;
  const images = Array.isArray(rawData["image"])
    ? (rawData["image"] as string[])
    : typeof rawData["image"] === "string"
      ? [rawData["image"] as string]
      : [];

  const propertyJsonLd = buildPropertyJsonLd(
    {
      id: property.id,
      title: displayTitle,
      propertyType: property.propertyType,
      listingType: property.listingType,
      priceCents: property.priceCents,
      currency: property.currency,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      constructionM2: property.constructionM2,
      landM2: property.landM2,
      country: property.country,
      state: property.state,
      city: property.city,
      neighborhood: property.neighborhood,
      address: property.address,
      postalCode: property.postalCode,
      latitude: property.latitude,
      longitude: property.longitude,
      sourceUrl: property.sourceUrl,
    },
    {
      canonicalUrl,
      locale,
      images: images.map((url) => ({ url })),
      description: metaDescriptionForJsonLd,
    },
  );

  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    BASE_URL,
    locale,
    { state: property.state, city: property.city, title: displayTitle },
    canonicalUrl,
  );

  const faqJsonLd =
    structured && structured.faq.length > 0
      ? buildFaqJsonLd(structured.faq)
      : null;

  // Format price for display (P1: from typed column, never LLM)
  const priceStr = property.priceCents
    ? formatPrice(property.priceCents, property.currency, locale)
    : null;

  return (
    <>
      {/* Schema.org JSON-LD — critical for SEO (P1 compliance: facts only) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(propertyJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}

      <div className="min-h-screen bg-background">
        {/* Hero */}
        {images[0] && (
          <div className="relative aspect-[21/9] w-full overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[0]}
              alt={displayTitle}
              className="h-full w-full object-cover"
              fetchPriority="high"
            />
          </div>
        )}

        <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
          {/* Title section */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                {displayH1}
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">
                {property.city}, {property.state}
              </p>
            </div>
            {priceStr && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{labels.price}</p>
                <p className="text-3xl font-bold text-primary">{priceStr}</p>
              </div>
            )}
          </div>

          {/* Facts grid */}
          <div className="mt-6 grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4">
            {property.bedrooms != null && (
              <Fact label={labels.bedrooms} value={String(property.bedrooms)} />
            )}
            {property.bathrooms != null && (
              <Fact
                label={labels.bathrooms}
                value={String(property.bathrooms)}
              />
            )}
            {property.constructionM2 != null && (
              <Fact
                label={labels.construction}
                value={`${property.constructionM2} m²`}
              />
            )}
            {property.landM2 != null && (
              <Fact label={labels.land} value={`${property.landM2} m²`} />
            )}
          </div>

          {/* Content + sidebar */}
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {structured ? (
                <StructuredBody content={structured} labels={labels} />
              ) : (
                <LegacyBody
                  description={
                    legacyContent?.["description"] ?? fallbackTpl.description
                  }
                  heading={labels.description}
                />
              )}

              {/* Gallery */}
              {images.length > 1 && (
                <div className="mt-8">
                  <h2 className="mb-3 text-xl font-semibold">
                    {labels.gallery}
                  </h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {images.slice(1).map((url, i) => (
                      <div
                        key={url}
                        className="aspect-[4/3] overflow-hidden rounded-lg border bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`${displayTitle} ${i + 2}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FAQ */}
              {structured && structured.faq.length > 0 && (
                <div className="mt-10">
                  <h2 className="mb-4 text-xl font-semibold">{labels.faq}</h2>
                  <Accordion>
                    {structured.faq.map((f, i) => (
                      <AccordionItem key={i} value={`faq-${i}`}>
                        <AccordionTrigger>{f.question}</AccordionTrigger>
                        <AccordionContent>{f.answer}</AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}
            </div>

            {/* Sidebar — P8: lead capture */}
            <div className="space-y-4">
              <WhatsAppCTA
                propertyTitle={displayTitle}
                propertyUrl={canonicalUrl}
              />
              <LeadForm propertyId={property.id} />
              {/* Source domain badge removed intentionally (anonimato P7).
                  The source is never exposed to end users so they cannot
                  bypass the marketplace. */}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StructuredBody({
  content,
  labels,
}: {
  content: StructuredContent;
  labels: (typeof LABELS)[Locale];
}) {
  return (
    <div className="space-y-8">
      {content.hero.intro && (
        <div className="text-base leading-7 text-foreground/85 whitespace-pre-line">
          {content.hero.intro}
        </div>
      )}
      {content.features.body && (
        <Section
          heading={content.features.heading || labels.features}
          body={content.features.body}
        />
      )}
      {content.location.body && (
        <Section
          heading={content.location.heading || labels.location}
          body={content.location.body}
        />
      )}
      {content.lifestyle.body && (
        <Section
          heading={content.lifestyle.heading || labels.lifestyle}
          body={content.lifestyle.body}
        />
      )}
    </div>
  );
}

function Section({ heading, body }: { heading: string; body: string }) {
  return (
    <div>
      <h2 className="mb-3 text-xl font-semibold">{heading}</h2>
      <div className="text-sm leading-7 text-foreground/80 whitespace-pre-line">
        {body}
      </div>
    </div>
  );
}

function LegacyBody({
  description,
  heading,
}: {
  description: string;
  heading: string;
}) {
  return (
    <div>
      <h2 className="mb-3 text-xl font-semibold">{heading}</h2>
      <div className="text-sm leading-7 text-foreground/80 whitespace-pre-line">
        {description}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatPrice(cents: number, currency: string, locale: Locale): string {
  const amount = cents / 100;
  const localeMap: Record<Locale, string> = {
    es: "es-MX",
    en: "en-US",
    fr: "fr-FR",
  };
  const formatted = amount.toLocaleString(localeMap[locale], {
    maximumFractionDigits: 0,
  });
  return `${currency} ${formatted}`;
}
