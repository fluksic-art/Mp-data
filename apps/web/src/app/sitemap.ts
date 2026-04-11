import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db";
import { properties } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import {
  buildListingUrl,
  buildListingSlug,
  isSlugAdjectiveKey,
} from "@mpgenesis/shared";

const BASE_URL = process.env["NEXT_PUBLIC_BASE_URL"] ?? "https://example.com";
const LOCALES = ["es", "en", "fr"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb();

  // Only published listings appear in the sitemap (P7: human approval)
  const published = await db
    .select({
      id: properties.id,
      state: properties.state,
      city: properties.city,
      propertyType: properties.propertyType,
      listingType: properties.listingType,
      slugAdjective: properties.slugAdjective,
      publishedAt: properties.publishedAt,
      lastSeenAt: properties.lastSeenAt,
    })
    .from(properties)
    .where(eq(properties.status, "published"));

  const entries: MetadataRoute.Sitemap = [];

  // Homepage in each locale
  for (const locale of LOCALES) {
    const homeUrl = `${BASE_URL}/${locale}`;
    entries.push({
      url: homeUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
      alternates: {
        languages: Object.fromEntries(
          LOCALES.map((l) => [
            l === "es" ? "es-mx" : l,
            `${BASE_URL}/${l}`,
          ]),
        ),
      },
    });
  }

  // Property listing pages — one entry per property per locale
  // with hreflang alternates. Slug is anonymized: no developer/development
  // name appears in the URL path.
  for (const property of published) {
    const slugAdjective = isSlugAdjectiveKey(property.slugAdjective)
      ? property.slugAdjective
      : null;
    const idPrefix = property.id.slice(0, 8);

    const localeUrls = Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        buildListingUrl(
          BASE_URL,
          locale,
          property.state,
          property.city,
          property.propertyType,
          property.listingType,
          buildListingSlug({
            propertyType: property.propertyType,
            city: property.city,
            slugAdjective,
            idPrefix,
            locale,
          }),
        ),
      ]),
    );

    const languages = Object.fromEntries(
      LOCALES.map((locale) => [
        locale === "es" ? "es-mx" : locale,
        localeUrls[locale]!,
      ]),
    );

    for (const locale of LOCALES) {
      entries.push({
        url: localeUrls[locale]!,
        lastModified: property.publishedAt ?? property.lastSeenAt,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: { languages },
      });
    }
  }

  return entries;
}
