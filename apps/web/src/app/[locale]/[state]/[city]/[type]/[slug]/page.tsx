import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { properties, sources } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import {
  buildPropertyJsonLd,
  buildBreadcrumbJsonLd,
  buildListingUrl,
  buildListingMeta,
  slugify,
} from "@mpgenesis/shared";
import { LeadForm, WhatsAppCTA } from "@/components/lead-form";

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
  // Extract the ID prefix from the end of the slug
  const idPrefix = slug.slice(-8);
  if (idPrefix.length < 8) return null;

  const db = getDb();
  const all = await db
    .select()
    .from(properties)
    .where(eq(properties.status, "published"));

  // Match by the first 8 chars of the property ID
  return all.find((p) => p.id.startsWith(idPrefix)) ?? null;
}

function isValidLocale(locale: string): locale is Locale {
  return (VALID_LOCALES as readonly string[]).includes(locale);
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

  // Use paraphrased meta if available, fall back to template
  const contentField = locale === "es" ? "contentEs" : locale === "en" ? "contentEn" : "contentFr";
  const content = property[contentField] as Record<string, string> | null;

  const meta = content?.["metaTitle"]
    ? {
        title: content["metaTitle"],
        description: content["metaDescription"] ?? "",
        h1: content["h1"] ?? "",
      }
    : buildListingMeta(
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

  const canonicalSlug = slugify(`${property.title}-${property.id.slice(0, 8)}`);

  // Build hreflang alternates for all 3 locales
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
        canonicalSlug,
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
    canonicalSlug,
  );

  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical,
      languages: { ...alternates, "x-default": alternates["es-mx"]! },
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
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

  const db = getDb();
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, property.sourceId))
    .limit(1);

  // Get content for this locale
  const contentField = locale === "es" ? "contentEs" : locale === "en" ? "contentEn" : "contentFr";
  const content = property[contentField] as Record<string, string> | null;

  // Fall back to template-rendered content
  const meta = content
    ? {
        title: content["title"] ?? property.title,
        description: content["description"] ?? "",
        h1: content["h1"] ?? property.title,
      }
    : buildListingMeta(
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

  // Build canonical URL and JSON-LD
  const canonicalSlug = slugify(`${property.title}-${property.id.slice(0, 8)}`);
  const canonicalUrl = buildListingUrl(
    BASE_URL,
    locale,
    property.state,
    property.city,
    property.propertyType,
    property.listingType,
    canonicalSlug,
  );

  // Get images from raw_data (JSON-LD) — P1: facts via typed columns
  const rawData = property.rawData as Record<string, unknown>;
  const images = Array.isArray(rawData["image"])
    ? (rawData["image"] as string[])
    : typeof rawData["image"] === "string"
      ? [rawData["image"] as string]
      : [];

  const propertyJsonLd = buildPropertyJsonLd(
    {
      id: property.id,
      title: meta.title,
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
      description: meta.description,
    },
  );

  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    BASE_URL,
    locale,
    { state: property.state, city: property.city, title: meta.title },
    canonicalUrl,
  );

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

      <div className="min-h-screen bg-background">
        {/* Hero */}
        {images[0] && (
          <div className="relative aspect-[21/9] w-full overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[0]}
              alt={meta.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
          {/* Title section */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                {meta.h1}
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">
                {property.city}, {property.state}
              </p>
            </div>
            {priceStr && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground">
                  {locale === "es" ? "Precio" : locale === "en" ? "Price" : "Prix"}
                </p>
                <p className="text-3xl font-bold text-primary">{priceStr}</p>
              </div>
            )}
          </div>

          {/* Facts grid */}
          <div className="mt-6 grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4">
            {property.bedrooms != null && (
              <Fact
                label={locale === "es" ? "Recámaras" : locale === "en" ? "Bedrooms" : "Chambres"}
                value={String(property.bedrooms)}
              />
            )}
            {property.bathrooms != null && (
              <Fact
                label={locale === "es" ? "Baños" : locale === "en" ? "Bathrooms" : "Sdb"}
                value={String(property.bathrooms)}
              />
            )}
            {property.constructionM2 != null && (
              <Fact
                label={locale === "es" ? "Construcción" : locale === "en" ? "Construction" : "Construction"}
                value={`${property.constructionM2} m²`}
              />
            )}
            {property.landM2 != null && (
              <Fact
                label={locale === "es" ? "Terreno" : locale === "en" ? "Land" : "Terrain"}
                value={`${property.landM2} m²`}
              />
            )}
          </div>

          {/* Description + sidebar */}
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h2 className="mb-3 text-xl font-semibold">
                {locale === "es" ? "Descripción" : locale === "en" ? "Description" : "Description"}
              </h2>
              <div className="text-sm leading-7 text-foreground/80 whitespace-pre-line">
                {meta.description}
              </div>

              {/* Gallery */}
              {images.length > 1 && (
                <div className="mt-8">
                  <h2 className="mb-3 text-xl font-semibold">
                    {locale === "es" ? "Galería" : locale === "en" ? "Gallery" : "Galerie"}
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
                          alt={`${meta.title} ${i + 2}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar — P8: lead capture */}
            <div className="space-y-4">
              <WhatsAppCTA
                propertyTitle={meta.title}
                propertyUrl={canonicalUrl}
              />
              <LeadForm propertyId={property.id} />

              {source && (
                <div className="rounded-lg border bg-card p-4 text-xs text-muted-foreground">
                  {locale === "es" ? "Información de" : locale === "en" ? "Listed by" : "Annonce de"}{" "}
                  <span className="font-medium">{source.domain}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
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
