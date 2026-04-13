import Link from "next/link";
import { getDb } from "@/lib/db";
import {
  properties,
  sources,
  propertyImages,
} from "@mpgenesis/database";
import {
  desc,
  asc,
  eq,
  count,
  ilike,
  and,
  sql,
  type SQL,
} from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AutoRefresh } from "./auto-refresh";
import { ListingsToolbar } from "./toolbar";
import { DuplicateActions } from "./duplicate-actions";

export const dynamic = "force-dynamic";

const PER_PAGE_OPTIONS = [50, 100, 200, 500, 1000] as const;

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ListingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const db = getDb();

  // Parse params
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = PER_PAGE_OPTIONS.includes(Number(params.perPage) as (typeof PER_PAGE_OPTIONS)[number])
    ? (Number(params.perPage) as number)
    : 100;
  const status = typeof params.status === "string" ? params.status : undefined;
  const city = typeof params.city === "string" ? params.city : undefined;
  const propertyType = typeof params.propertyType === "string" ? params.propertyType : undefined;
  const search = typeof params.search === "string" ? params.search : undefined;
  const pipeline = typeof params.pipeline === "string" ? params.pipeline : undefined;

  // Build WHERE conditions
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(properties.status, status));
  if (city) conditions.push(eq(properties.city, city));
  if (propertyType) conditions.push(eq(properties.propertyType, propertyType));
  if (search) conditions.push(ilike(properties.title, `%${search}%`));
  if (pipeline === "extracted") {
    conditions.push(sql`${properties.contentEs} IS NULL`);
  } else if (pipeline === "paraphrased") {
    conditions.push(sql`${properties.contentEs} IS NOT NULL AND ${properties.contentEn} IS NULL`);
  } else if (pipeline === "translated") {
    conditions.push(sql`${properties.contentEs} IS NOT NULL AND ${properties.contentEn} IS NOT NULL`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Image count subquery
  const imageCountSq = db
    .select({
      propertyId: propertyImages.propertyId,
      imageCount: count().as("image_count"),
    })
    .from(propertyImages)
    .groupBy(propertyImages.propertyId)
    .as("img_counts");

  // Main query
  const listings = await db
    .select({
      id: properties.id,
      title: properties.title,
      propertyType: properties.propertyType,
      listingType: properties.listingType,
      priceCents: properties.priceCents,
      currency: properties.currency,
      city: properties.city,
      state: properties.state,
      bedrooms: properties.bedrooms,
      bathrooms: properties.bathrooms,
      constructionM2: properties.constructionM2,
      landM2: properties.landM2,
      status: properties.status,
      sourceDomain: sources.domain,
      firstSeenAt: properties.firstSeenAt,
      contentEs: properties.contentEs,
      contentEn: properties.contentEn,
      contentFr: properties.contentFr,
      imageCount: imageCountSq.imageCount,
    })
    .from(properties)
    .leftJoin(sources, eq(properties.sourceId, sources.id))
    .leftJoin(imageCountSq, eq(properties.id, imageCountSq.propertyId))
    .where(where)
    .orderBy(desc(properties.firstSeenAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  // Counts
  const [total] = await db
    .select({ value: count() })
    .from(properties)
    .where(where);

  const [totalAll] = await db.select({ value: count() }).from(properties);

  // Get distinct values for filter dropdowns
  const cities = await db
    .selectDistinct({ city: properties.city })
    .from(properties)
    .orderBy(asc(properties.city));

  const propTypes = await db
    .selectDistinct({ propertyType: properties.propertyType })
    .from(properties)
    .orderBy(asc(properties.propertyType));

  const statuses = await db
    .selectDistinct({ status: properties.status })
    .from(properties)
    .orderBy(asc(properties.status));

  const totalCount = total?.value ?? 0;
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
          <p className="text-sm text-muted-foreground">
            {totalCount} of {totalAll?.value ?? 0} properties
            {where ? " (filtered)" : ""}
          </p>
          <AutoRefresh />
        </div>
      </div>

      <ListingsToolbar
        currentStatus={status}
        currentCity={city}
        currentPropertyType={propertyType}
        currentSearch={search}
        currentPerPage={perPage}
        currentPipeline={pipeline}
        statuses={statuses.map((s) => s.status)}
        cities={cities.map((c) => c.city)}
        propertyTypes={propTypes.map((p) => p.propertyType)}
      />

      <Card className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30%]">Property</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Images</TableHead>
              <TableHead>Pipeline</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-12 text-center text-muted-foreground"
                >
                  No listings match your filters.
                </TableCell>
              </TableRow>
            ) : (
              listings.map((listing) => (
                <TableRow key={listing.id} className="group">
                  <TableCell>
                    <Link
                      href={`/admin/listings/${listing.id}`}
                      className="block"
                    >
                      <p className="text-sm font-medium group-hover:text-primary">
                        {cleanTitle(listing.title)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {listing.propertyType} · {listing.listingType}
                        {listing.bedrooms ? ` · ${listing.bedrooms}bd` : ""}
                        {listing.bathrooms != null ? ` · ${listing.bathrooms}ba` : ""}
                      </p>
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums text-sm">
                    {listing.priceCents
                      ? formatPrice(listing.priceCents, listing.currency)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {listing.constructionM2
                      ? `${listing.constructionM2} m²`
                      : "—"}
                    {listing.landM2 ? (
                      <span className="block text-xs text-muted-foreground">
                        {listing.landM2} m² land
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{listing.city}</span>
                    <span className="block text-xs text-muted-foreground">
                      {listing.state}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums text-sm">
                    {listing.imageCount ?? 0}
                  </TableCell>
                  <TableCell>
                    <PipelineBadges listing={listing} />
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={listing.status} />
                    {listing.status === "possible_duplicate" && (
                      <DuplicateActions propertyId={listing.id} />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <PaginationLink page={page - 1} params={params} label="Previous" />
            )}
            {page < totalPages && (
              <PaginationLink page={page + 1} params={params} label="Next" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PaginationLink({
  page,
  params,
  label,
}: {
  page: number;
  params: Record<string, string | string[] | undefined>;
  label: string;
}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") sp.set(k, String(v));
  }
  sp.set("page", String(page));
  return (
    <Link
      href={`/admin/listings?${sp.toString()}`}
      className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
    >
      {label}
    </Link>
  );
}

function PipelineBadges({
  listing,
}: {
  listing: {
    contentEs: unknown;
    contentEn: unknown;
    contentFr: unknown;
  };
}) {
  const hasEs = listing.contentEs != null;
  const hasEn = listing.contentEn != null;
  const hasFr = listing.contentFr != null;

  if (!hasEs) {
    return <span className="text-xs text-muted-foreground">extracted</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant="outline" className="text-[10px]">ES</Badge>
      {hasEn && <Badge variant="outline" className="text-[10px]">EN</Badge>}
      {hasFr && <Badge variant="outline" className="text-[10px]">FR</Badge>}
    </div>
  );
}

function cleanTitle(title: string): string {
  return title.replace(/&#\d+;/g, "'").replace(/&amp;/g, "&");
}

function formatPrice(cents: number, currency: string): string {
  const amount = cents / 100;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "$";
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${symbol}${formatted} ${currency}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "possible_duplicate") {
    return (
      <Badge variant="outline" className="border-yellow-500 text-[11px] text-yellow-600">
        duplicate?
      </Badge>
    );
  }

  const variant =
    status === "published"
      ? "default"
      : status === "review"
        ? "secondary"
        : status === "failed" || status === "archived"
          ? "destructive"
          : "outline";

  return (
    <Badge variant={variant} className="text-[11px]">
      {status}
    </Badge>
  );
}
