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
  or,
  gte,
  lte,
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
import { parseVisibleColumns, COLUMN_DEFAULT_WIDTHS, type ColumnKey } from "./columns";
import { DuplicateActions } from "./duplicate-actions";
import { ResizableColgroup, ResizeHandle } from "./resizable";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PER_PAGE_OPTIONS = [50, 100, 200, 500, 1000] as const;

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function str(val: string | string[] | undefined): string | undefined {
  return typeof val === "string" ? val : undefined;
}

export default async function ListingsPage({ searchParams }: Props) {
  try {
    return await ListingsPageInner({ searchParams });
  } catch (e) {
    return (
      <div className="py-12">
        <h2 className="text-xl font-semibold text-destructive mb-2">Error loading listings</h2>
        <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto whitespace-pre-wrap">
          {e instanceof Error ? `${e.message}\n\n${e.stack}` : String(e)}
        </pre>
      </div>
    );
  }
}

async function ListingsPageInner({ searchParams }: Props) {
  const params = await searchParams;
  const db = getDb();

  // Parse params
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = PER_PAGE_OPTIONS.includes(Number(params.perPage) as (typeof PER_PAGE_OPTIONS)[number])
    ? (Number(params.perPage) as number)
    : 50;
  const status = str(params.status);
  const city = str(params.city);
  const propertyType = str(params.propertyType);
  const listingType = str(params.listingType);
  const source = str(params.source);
  const search = str(params.search);
  const pipeline = str(params.pipeline);
  const sort = str(params.sort);
  const minPrice = str(params.minPrice);
  const maxPrice = str(params.maxPrice);
  const bedrooms = str(params.bedrooms);
  const visibleColumns = parseVisibleColumns(str(params.columns));

  // Build WHERE conditions
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(properties.status, status));
  if (city) conditions.push(eq(properties.city, city));
  if (propertyType) conditions.push(eq(properties.propertyType, propertyType));
  if (listingType) conditions.push(eq(properties.listingType, listingType));
  if (search) {
    conditions.push(
      or(
        ilike(properties.title, `%${search}%`),
        ilike(properties.developerName, `%${search}%`),
        ilike(properties.developmentName, `%${search}%`),
        ilike(properties.neighborhood, `%${search}%`),
        ilike(properties.address, `%${search}%`),
      )!,
    );
  }
  if (pipeline === "extracted") {
    conditions.push(sql`${properties.contentEs} IS NULL`);
  } else if (pipeline === "paraphrased") {
    conditions.push(sql`${properties.contentEs} IS NOT NULL AND ${properties.contentEn} IS NULL`);
  } else if (pipeline === "translated") {
    conditions.push(sql`${properties.contentEs} IS NOT NULL AND ${properties.contentEn} IS NOT NULL`);
  }
  if (minPrice) {
    const cents = Math.round(Number(minPrice) * 100);
    if (!isNaN(cents)) conditions.push(gte(properties.priceCents, cents));
  }
  if (maxPrice) {
    const cents = Math.round(Number(maxPrice) * 100);
    if (!isNaN(cents)) conditions.push(lte(properties.priceCents, cents));
  }
  if (bedrooms) {
    const b = Number(bedrooms);
    if (b === 4) {
      conditions.push(gte(properties.bedrooms, 4));
    } else if (!isNaN(b)) {
      conditions.push(eq(properties.bedrooms, b));
    }
  }

  // Source filter needs a join condition
  if (source) {
    conditions.push(eq(sources.domain, source));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Sort
  let orderBy;
  switch (sort) {
    case "oldest":
      orderBy = asc(properties.firstSeenAt);
      break;
    case "price_asc":
      orderBy = asc(properties.priceCents);
      break;
    case "price_desc":
      orderBy = desc(properties.priceCents);
      break;
    case "size_asc":
      orderBy = asc(properties.constructionM2);
      break;
    case "size_desc":
      orderBy = desc(properties.constructionM2);
      break;
    case "title_asc":
      orderBy = asc(properties.title);
      break;
    default:
      orderBy = desc(properties.firstSeenAt);
  }

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
      developerName: properties.developerName,
      developmentName: properties.developmentName,
      neighborhood: properties.neighborhood,
      firstSeenAt: properties.firstSeenAt,
      lastSeenAt: properties.lastSeenAt,
      contentEs: properties.contentEs,
      contentEn: properties.contentEn,
      contentFr: properties.contentFr,
      imageCount: imageCountSq.imageCount,
    })
    .from(properties)
    .leftJoin(sources, eq(properties.sourceId, sources.id))
    .leftJoin(imageCountSq, eq(properties.id, imageCountSq.propertyId))
    .where(where)
    .orderBy(orderBy)
    .limit(perPage)
    .offset((page - 1) * perPage);

  // Counts
  const [total] = await db
    .select({ value: count() })
    .from(properties)
    .leftJoin(sources, eq(properties.sourceId, sources.id))
    .where(where);

  const [totalAll] = await db.select({ value: count() }).from(properties);

  // Get distinct values for filter dropdowns
  const [citiesQ, propTypesQ, statusesQ, listingTypesQ, sourceDomainsQ] = await Promise.all([
    db.selectDistinct({ city: properties.city }).from(properties).orderBy(asc(properties.city)),
    db.selectDistinct({ propertyType: properties.propertyType }).from(properties).orderBy(asc(properties.propertyType)),
    db.selectDistinct({ status: properties.status }).from(properties).orderBy(asc(properties.status)),
    db.selectDistinct({ listingType: properties.listingType }).from(properties).orderBy(asc(properties.listingType)),
    db.selectDistinct({ domain: sources.domain }).from(sources).orderBy(asc(sources.domain)),
  ]);

  const totalCount = total?.value ?? 0;
  const totalPages = Math.ceil(totalCount / perPage);

  const colCount = visibleColumns.length;

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
        currentListingType={listingType}
        currentSource={source}
        currentSearch={search}
        currentPerPage={perPage}
        currentPipeline={pipeline}
        currentSort={sort}
        currentColumns={visibleColumns}
        currentMinPrice={minPrice}
        currentMaxPrice={maxPrice}
        currentBedrooms={bedrooms}
        statuses={statusesQ.map((s) => s.status)}
        cities={citiesQ.map((c) => c.city)}
        propertyTypes={propTypesQ.map((p) => p.propertyType)}
        listingTypes={listingTypesQ.map((t) => t.listingType)}
        sourceDomains={sourceDomainsQ.map((s) => s.domain)}
      />

      <Card className="mt-4 overflow-x-auto">
        <Table className="table-fixed [&_td]:overflow-hidden [&_td_p]:truncate [&_td_span]:truncate">
          <ResizableColgroup
            columnKeys={visibleColumns}
            defaults={COLUMN_DEFAULT_WIDTHS}
          />
          <TableHeader>
            <TableRow>
              {visibleColumns.map((key) => (
                <ResizableTh
                  key={key}
                  columnKey={key}
                  align={key === "status" ? "right" : "left"}
                >
                  {COLUMN_LABELS[key]}
                </ResizableTh>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {listings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="py-12 text-center text-muted-foreground"
                >
                  No listings match your filters.
                </TableCell>
              </TableRow>
            ) : (
              listings.map((listing) => (
                <TableRow key={listing.id} className="group">
                  {visibleColumns.map((key) => renderCell(key, listing))}
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

const COLUMN_LABELS: Record<ColumnKey, string> = {
  title: "Property",
  price: "Price",
  size: "Size",
  location: "Location",
  bedrooms: "Beds/Baths",
  source: "Source",
  developer: "Developer",
  development: "Development",
  neighborhood: "Neighborhood",
  images: "Imgs",
  pipeline: "Pipeline",
  firstSeen: "First Seen",
  lastSeen: "Last Seen",
  status: "Status",
};

function ResizableTh({
  columnKey,
  align = "left",
  children,
}: {
  columnKey: ColumnKey;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <TableHead className={cn("relative", align === "right" && "text-right")}>
      {children}
      <ResizeHandle columnKey={columnKey} />
    </TableHead>
  );
}

/** Pipeline stages for a listing. Shows three segments (ES, EN, FR)
 * plus a text label for the current stage of the processing pipeline:
 *   extracted → paraphrased → translating → fully translated
 */
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
  const done = [hasEs, hasEn, hasFr].filter(Boolean).length;

  const label =
    done === 0
      ? "extracted"
      : done === 1
        ? "paraphrased"
        : done === 2
          ? "translating"
          : "fully translated";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <StageDot label="ES" done={hasEs} />
        <StageDot label="EN" done={hasEn} />
        <StageDot label="FR" done={hasFr} />
      </div>
      <span className="text-[10px] text-muted-foreground leading-none">
        {label}
      </span>
    </div>
  );
}

function StageDot({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-[26px] items-center justify-center rounded-sm px-1 text-[9px] font-semibold tabular-nums ring-1",
        done
          ? "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800"
          : "bg-muted text-muted-foreground ring-border",
      )}
    >
      {label}
    </span>
  );
}

type ListingRow = {
  id: string;
  title: string;
  propertyType: string;
  listingType: string;
  priceCents: number | null;
  currency: string;
  city: string;
  state: string;
  bedrooms: number | null;
  bathrooms: string | number | null;
  constructionM2: number | null;
  landM2: string | number | null;
  status: string;
  sourceDomain: string | null;
  developerName: string | null;
  developmentName: string | null;
  neighborhood: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  contentEs: unknown;
  contentEn: unknown;
  contentFr: unknown;
  imageCount: number | null;
};

function renderCell(key: ColumnKey, listing: ListingRow) {
  switch (key) {
    case "title":
      return (
        <TableCell key={key}>
          <Link href={`/admin/listings/${listing.id}`} className="block">
            <p className="text-sm font-medium group-hover:text-primary">
              {cleanTitle(listing.title)}
            </p>
            <p className="text-xs text-muted-foreground">
              {listing.propertyType} · {listing.listingType}
            </p>
          </Link>
        </TableCell>
      );
    case "price":
      return (
        <TableCell key={key} className="tabular-nums text-sm">
          {listing.priceCents
            ? formatPrice(listing.priceCents, listing.currency)
            : "—"}
        </TableCell>
      );
    case "size":
      return (
        <TableCell key={key} className="text-sm tabular-nums">
          {listing.constructionM2 ? `${listing.constructionM2} m²` : "—"}
          {listing.landM2 ? (
            <span className="block text-xs text-muted-foreground">
              {listing.landM2} m² land
            </span>
          ) : null}
        </TableCell>
      );
    case "location":
      return (
        <TableCell key={key}>
          <span className="text-sm">{listing.city}</span>
          <span className="block text-xs text-muted-foreground">
            {listing.state}
          </span>
        </TableCell>
      );
    case "bedrooms":
      return (
        <TableCell key={key} className="text-sm tabular-nums">
          {listing.bedrooms ?? "—"} bd / {listing.bathrooms ?? "—"} ba
        </TableCell>
      );
    case "source":
      return (
        <TableCell key={key} className="text-xs text-muted-foreground">
          {listing.sourceDomain ?? "—"}
        </TableCell>
      );
    case "developer":
      return (
        <TableCell key={key} className="text-sm">
          {listing.developerName ?? "—"}
        </TableCell>
      );
    case "development":
      return (
        <TableCell key={key} className="text-sm">
          {listing.developmentName ?? "—"}
        </TableCell>
      );
    case "neighborhood":
      return (
        <TableCell key={key} className="text-sm">
          {listing.neighborhood ?? "—"}
        </TableCell>
      );
    case "images":
      return (
        <TableCell key={key} className="tabular-nums text-sm">
          {listing.imageCount ?? 0}
        </TableCell>
      );
    case "pipeline":
      return (
        <TableCell key={key}>
          <PipelineBadges listing={listing} />
        </TableCell>
      );
    case "firstSeen":
      return (
        <TableCell key={key} className="text-xs text-muted-foreground tabular-nums">
          {formatDate(listing.firstSeenAt)}
        </TableCell>
      );
    case "lastSeen":
      return (
        <TableCell key={key} className="text-xs text-muted-foreground tabular-nums">
          {formatDate(listing.lastSeenAt)}
        </TableCell>
      );
    case "status":
      return (
        <TableCell key={key} className="text-right">
          <StatusBadge status={listing.status} />
          {listing.status === "possible_duplicate" && (
            <DuplicateActions propertyId={listing.id} />
          )}
        </TableCell>
      );
  }
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

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
