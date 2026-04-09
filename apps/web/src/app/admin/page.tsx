import Link from "next/link";
import { getDb } from "@/lib/db";
import { properties, sources, crawlRuns } from "@mpgenesis/database";
import { count, desc, eq } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminDashboard() {
  const db = getDb();

  const [propertyCount] = await db.select({ value: count() }).from(properties);
  const [sourceCount] = await db.select({ value: count() }).from(sources);
  const [crawlCount] = await db.select({ value: count() }).from(crawlRuns);

  const recentListings = await db
    .select({
      id: properties.id,
      title: properties.title,
      city: properties.city,
      propertyType: properties.propertyType,
      status: properties.status,
      firstSeenAt: properties.firstSeenAt,
    })
    .from(properties)
    .orderBy(desc(properties.firstSeenAt))
    .limit(5);

  const recentCrawls = await db
    .select({
      id: crawlRuns.id,
      status: crawlRuns.status,
      pagesCrawled: crawlRuns.pagesCrawled,
      listingsExtracted: crawlRuns.listingsExtracted,
      startedAt: crawlRuns.startedAt,
      sourceDomain: sources.domain,
    })
    .from(crawlRuns)
    .leftJoin(sources, eq(crawlRuns.sourceId, sources.id))
    .orderBy(desc(crawlRuns.startedAt))
    .limit(5);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your extraction pipeline
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Properties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {propertyCount?.value ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {sourceCount?.value ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Crawl Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {crawlCount?.value ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <div className="mt-8 grid grid-cols-2 gap-6">
        {/* Recent listings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Recent Listings
              </CardTitle>
              <Link
                href="/admin/listings"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View all →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {recentListings.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No listings yet
              </p>
            ) : (
              <ul className="space-y-3">
                {recentListings.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/admin/listings/${l.id}`}
                      className="group flex items-start justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium group-hover:text-primary">
                          {l.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {l.city} · {l.propertyType}
                        </p>
                      </div>
                      <StatusBadge status={l.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent crawls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Recent Crawl Runs
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {recentCrawls.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No crawls yet
              </p>
            ) : (
              <ul className="space-y-3">
                {recentCrawls.map((c) => (
                  <li key={c.id} className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {c.sourceDomain ?? "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.pagesCrawled} pages · {c.listingsExtracted} extracted
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "completed" || status === "published"
      ? "default"
      : status === "running" || status === "review"
        ? "secondary"
        : status === "failed"
          ? "destructive"
          : "outline";

  return <Badge variant={variant} className="text-[11px]">{status}</Badge>;
}
