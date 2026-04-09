import Link from "next/link";
import { getDb } from "@/lib/db";
import { properties, sources } from "@mpgenesis/database";
import { desc, eq, count } from "drizzle-orm";
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

export default async function ListingsPage() {
  const db = getDb();

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
      constructionM2: properties.constructionM2,
      status: properties.status,
      sourceDomain: sources.domain,
      firstSeenAt: properties.firstSeenAt,
    })
    .from(properties)
    .leftJoin(sources, eq(properties.sourceId, sources.id))
    .orderBy(desc(properties.firstSeenAt))
    .limit(100);

  const [total] = await db.select({ value: count() }).from(properties);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
          <p className="text-sm text-muted-foreground">
            {total?.value ?? 0} properties extracted
          </p>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Property</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center text-muted-foreground"
                >
                  No listings yet. Run{" "}
                  <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">
                    pnpm crawl &lt;domain&gt;
                  </code>{" "}
                  to start extracting.
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
                        {listing.propertyType}
                        {listing.bedrooms ? ` · ${listing.bedrooms} bed` : ""}
                        {listing.constructionM2
                          ? ` · ${listing.constructionM2} m²`
                          : ""}
                      </p>
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {listing.priceCents
                      ? formatPrice(listing.priceCents, listing.currency)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{listing.city}</span>
                    <br />
                    <span className="text-xs text-muted-foreground">
                      {listing.state}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {listing.sourceDomain ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={listing.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
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
