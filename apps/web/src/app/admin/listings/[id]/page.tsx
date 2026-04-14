import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { properties, sources, propertyImages } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LeadForm, WhatsAppCTA } from "@/components/lead-form";
import { ContentPreview } from "@/components/content-preview";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const [listing] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);

  if (!listing) {
    notFound();
  }

  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, listing.sourceId))
    .limit(1);

  const images = await db
    .select()
    .from(propertyImages)
    .where(eq(propertyImages.propertyId, id))
    .orderBy(propertyImages.position);

  const rawData = listing.rawData as Record<string, unknown>;
  const imageUrls = getImageUrls(images, rawData);
  const heroImage = imageUrls[0] ?? null;

  return (
    <div>
      {/* Breadcrumb */}
      <Link
        href="/admin/listings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to listings
      </Link>

      {/* Hero section */}
      <div className="mt-4">
        {heroImage && (
          <div className="mb-6 aspect-[21/9] overflow-hidden rounded-xl border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImage}
              alt={cleanTitle(listing.title)}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {cleanTitle(listing.title)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {listing.propertyType} · {listing.listingType} · {listing.city},{" "}
              {listing.state}
            </p>
          </div>
          <StatusBadge status={listing.status} />
        </div>
      </div>

      {/* Key facts */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FactCard
          label="Price"
          value={
            listing.priceCents
              ? formatPrice(listing.priceCents, listing.currency)
              : null
          }
          highlight
        />
        <FactCard
          label="Bedrooms"
          value={listing.bedrooms != null ? String(listing.bedrooms) : null}
        />
        <FactCard
          label="Bathrooms"
          value={listing.bathrooms != null ? String(listing.bathrooms) : null}
        />
        <FactCard
          label="Construction"
          value={
            listing.constructionM2 != null
              ? `${listing.constructionM2} m²`
              : null
          }
        />
        <FactCard
          label="Land"
          value={listing.landM2 != null ? `${listing.landM2} m²` : null}
        />
        <FactCard
          label="Parking"
          value={
            listing.parkingSpaces != null
              ? String(listing.parkingSpaces)
              : null
          }
        />
        <FactCard label="Source" value={source?.domain ?? null} />
        <FactCard
          label="First seen"
          value={listing.firstSeenAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        />
      </div>

      <Separator className="my-8" />

      {/* Two-column layout: content + details */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Content — left 2/3 */}
        <div className="lg:col-span-2 space-y-8">
          {/* Multilingual content preview */}
          <ContentPreview
            contentEs={listing.contentEs}
            contentEn={listing.contentEn}
            contentFr={listing.contentFr}
            rawData={rawData}
          />

          {/* Enriched PDF content (brochure + pricelist) */}
          {(typeof rawData["brochureText"] === "string" ||
            typeof rawData["pricelistText"] === "string" ||
            Array.isArray(rawData["brochureUrls"]) ||
            Array.isArray(rawData["pricelistUrls"])) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Enriched Content (from PDFs)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Brochure */}
                {typeof rawData["brochureText"] === "string" &&
                  (rawData["brochureText"] as string).length > 0 && (
                    <div className="rounded-lg border bg-muted/30">
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Badge variant="secondary">BROCHURE</Badge>
                          {(rawData["brochureText"] as string).length.toLocaleString()} chars
                        </span>
                        {Array.isArray(rawData["brochureUrls"]) &&
                          (rawData["brochureUrls"] as string[])[0] && (
                            <a
                              href={(rawData["brochureUrls"] as string[])[0]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-foreground underline"
                            >
                              View PDF ↗
                            </a>
                          )}
                      </div>
                      <details className="group">
                        <summary className="cursor-pointer border-t px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent">
                          Show extracted text
                        </summary>
                        <div className="max-h-[500px] overflow-auto border-t bg-background px-4 py-3 text-sm leading-6 whitespace-pre-line">
                          {rawData["brochureText"] as string}
                        </div>
                      </details>
                    </div>
                  )}

                {/* Pricelist */}
                {typeof rawData["pricelistText"] === "string" &&
                  (rawData["pricelistText"] as string).length > 0 && (
                    <div className="rounded-lg border bg-muted/30">
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Badge variant="secondary">PRICELIST</Badge>
                          {(rawData["pricelistText"] as string).length.toLocaleString()} chars
                        </span>
                        {Array.isArray(rawData["pricelistUrls"]) &&
                          (rawData["pricelistUrls"] as string[])[0] && (
                            <a
                              href={(rawData["pricelistUrls"] as string[])[0]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-foreground underline"
                            >
                              View PDF ↗
                            </a>
                          )}
                      </div>
                      <details className="group">
                        <summary className="cursor-pointer border-t px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent">
                          Show extracted text
                        </summary>
                        <div className="max-h-[500px] overflow-auto border-t bg-background px-4 py-3 font-mono text-xs leading-6 whitespace-pre-line">
                          {rawData["pricelistText"] as string}
                        </div>
                      </details>
                    </div>
                  )}

                {/* Pricelist image preview */}
                {Array.isArray(rawData["pricelistImages"]) &&
                  (rawData["pricelistImages"] as string[]).length > 0 && (
                    <details className="group rounded-lg border bg-muted/30">
                      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-accent">
                        <Badge variant="secondary">PRICELIST IMG</Badge>
                        {(rawData["pricelistImages"] as string[]).length} image(s)
                      </summary>
                      <div className="border-t bg-background p-3 space-y-2">
                        {(rawData["pricelistImages"] as string[]).map((src, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={src}
                            alt={`Pricelist ${i + 1}`}
                            className="w-full rounded-md border"
                          />
                        ))}
                      </div>
                    </details>
                  )}

                {/* Plans */}
                {Array.isArray(rawData["planUrls"]) &&
                  (rawData["planUrls"] as string[]).length > 0 && (
                    <details className="group rounded-lg border bg-muted/30">
                      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-accent">
                        <Badge variant="secondary">PLANS</Badge>
                        {(rawData["planUrls"] as string[]).length} image(s)
                      </summary>
                      <div className="border-t bg-background p-3 grid grid-cols-2 gap-2">
                        {(rawData["planUrls"] as string[]).map((src, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={src}
                            alt={`Plan ${i + 1}`}
                            className="w-full rounded-md border"
                          />
                        ))}
                      </div>
                    </details>
                  )}

                {/* Videos + website */}
                {(Array.isArray(rawData["videoUrls"]) &&
                  (rawData["videoUrls"] as string[]).length > 0) ||
                rawData["websiteUrl"] ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {Array.isArray(rawData["videoUrls"]) &&
                      (rawData["videoUrls"] as string[]).map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border px-3 py-1.5 hover:bg-accent"
                        >
                          📹 Video {i + 1}
                        </a>
                      ))}
                    {typeof rawData["websiteUrl"] === "string" && (
                      <a
                        href={rawData["websiteUrl"] as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border px-3 py-1.5 hover:bg-accent"
                      >
                        🌐 Developer website
                      </a>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Gallery */}
          {imageUrls.length > 1 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Gallery ({imageUrls.length})
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {imageUrls.map((url, i) => (
                  <div
                    key={url}
                    className="aspect-[4/3] overflow-hidden rounded-lg border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Image ${i + 1}`}
                      className="h-full w-full object-cover transition-transform hover:scale-105"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — right 1/3 */}
        <div className="space-y-4">
          {/* P8: Lead capture — WhatsApp + form */}
          <WhatsAppCTA
            propertyTitle={cleanTitle(listing.title)}
            propertyUrl={listing.sourceUrl}
          />
          <LeadForm propertyId={listing.id} />

          {/* Source link */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Source</CardTitle>
            </CardHeader>
            <CardContent>
              <a
                href={listing.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-sm text-primary hover:underline"
              >
                {listing.sourceUrl}
              </a>
            </CardContent>
          </Card>

          {/* Coordinates */}
          {listing.latitude && listing.longitude && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Coordinates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-sm">
                  {listing.latitude}, {listing.longitude}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Internal anonimato metadata — operator-only, never public */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Anonimato (internal)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <MetaRow
                label="Developer"
                value={listing.developerName ?? "—"}
              />
              <MetaRow
                label="Development"
                value={listing.developmentName ?? "—"}
              />
              <MetaRow
                label="Slug adjective"
                value={listing.slugAdjective ?? "—"}
              />
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <MetaRow label="ID" value={listing.id.slice(0, 8) + "..."} />
              <MetaRow label="Source ID" value={listing.sourceListingId} />
              <MetaRow label="Content hash" value={listing.contentHash.slice(0, 12) + "..."} />
              <MetaRow
                label="Last seen"
                value={listing.lastSeenAt.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              />
            </CardContent>
          </Card>

          {/* Raw JSON (collapsible) */}
          <details className="group">
            <summary className="cursor-pointer rounded-lg border bg-card px-4 py-3 text-sm font-medium hover:bg-accent">
              Raw JSON Data
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg border bg-muted/50 p-4 text-[11px] leading-relaxed">
              {JSON.stringify(rawData, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

function FactCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | null;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/20 bg-primary/5" : ""}>
      <CardContent className="px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={`mt-1 text-sm font-semibold ${highlight ? "text-primary" : ""} ${!value ? "text-muted-foreground" : ""}`}
        >
          {value ?? "—"}
        </p>
      </CardContent>
    </Card>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "published"
      ? "default"
      : status === "review"
        ? "secondary"
        : status === "failed" || status === "archived"
          ? "destructive"
          : "outline";

  return <Badge variant={variant}>{status}</Badge>;
}

function cleanTitle(title: string): string {
  return title.replace(/&#\d+;/g, "'").replace(/&amp;/g, "&");
}

function formatPrice(cents: number, currency: string): string {
  const amount = cents / 100;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "$";
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}`;
}

function getImageUrls(
  images: Array<{
    cleanUrl: string | null;
    rawUrl: string | null;
    originalUrl: string;
  }>,
  rawData: Record<string, unknown>,
): string[] {
  if (images.length > 0) {
    return images.map((img) => img.cleanUrl ?? img.rawUrl ?? img.originalUrl);
  }
  if (Array.isArray(rawData["image"])) {
    return rawData["image"] as string[];
  }
  if (typeof rawData["image"] === "string") {
    return [rawData["image"]];
  }
  return [];
}
