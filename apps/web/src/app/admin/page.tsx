import Link from "next/link";
import { getDb } from "@/lib/db";
import {
  properties,
  sources,
  crawlRuns,
  propertyImages,
} from "@mpgenesis/database";
import { count, desc, eq, sql, and, isNotNull } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutoRefresh } from "./listings/auto-refresh";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const db = getDb();

  // ── Counts ──
  const [propertyCount] = await db.select({ value: count() }).from(properties);
  const [sourceCount] = await db.select({ value: count() }).from(sources);
  const [crawlCount] = await db.select({ value: count() }).from(crawlRuns);
  const [imageCount] = await db.select({ value: count() }).from(propertyImages);

  // ── Pipeline stages ──
  const [extracted] = await db
    .select({ value: count() })
    .from(properties)
    .where(sql`${properties.contentEs} IS NULL`);

  const [paraphrased] = await db
    .select({ value: count() })
    .from(properties)
    .where(
      and(
        isNotNull(properties.contentEs),
        sql`${properties.contentEn} IS NULL`,
      ),
    );

  const [translated] = await db
    .select({ value: count() })
    .from(properties)
    .where(
      and(
        isNotNull(properties.contentEs),
        isNotNull(properties.contentEn),
        isNotNull(properties.contentFr),
      ),
    );

  // ── Status breakdown ──
  const statusCounts = await db
    .select({
      status: properties.status,
      count: count(),
    })
    .from(properties)
    .groupBy(properties.status);

  // ── City breakdown (top 10) ──
  const cityCounts = await db
    .select({
      city: properties.city,
      count: count(),
    })
    .from(properties)
    .groupBy(properties.city)
    .orderBy(desc(count()))
    .limit(10);

  // ── Property type breakdown ──
  const typeCounts = await db
    .select({
      propertyType: properties.propertyType,
      count: count(),
    })
    .from(properties)
    .groupBy(properties.propertyType)
    .orderBy(desc(count()));

  // ── Crawl runs stats ──
  const crawlStats = await db
    .select({
      totalPages: sql<number>`COALESCE(SUM(${crawlRuns.pagesCrawled}), 0)`,
      totalExtracted: sql<number>`COALESCE(SUM(${crawlRuns.listingsExtracted}), 0)`,
      completed: sql<number>`COUNT(*) FILTER (WHERE ${crawlRuns.status} = 'completed')`,
      failed: sql<number>`COUNT(*) FILTER (WHERE ${crawlRuns.status} = 'failed')`,
      running: sql<number>`COUNT(*) FILTER (WHERE ${crawlRuns.status} = 'running')`,
    })
    .from(crawlRuns);

  // ── Cost estimates ──
  const totalProps = propertyCount?.value ?? 0;
  const tier3Count = Math.round(totalProps * 0.7); // ~70% need Tier 3
  const extractedCount = extracted?.value ?? 0;
  const paraphrasedCount = paraphrased?.value ?? 0;
  const translatedCount = translated?.value ?? 0;
  const fullyTranslated = translated?.value ?? 0;

  // Estimated costs based on measured rates
  const costExtraction = tier3Count * 0.005;
  const costParaphrase = (totalProps - extractedCount) * 0.017;
  const costTranslate = fullyTranslated * 0.04;
  const costProxy = 0.78; // measured from batch crawl
  const costTotal = costExtraction + costParaphrase + costTranslate + costProxy;

  // ── Recent crawls ──
  const recentCrawls = await db
    .select({
      id: crawlRuns.id,
      status: crawlRuns.status,
      pagesCrawled: crawlRuns.pagesCrawled,
      listingsExtracted: crawlRuns.listingsExtracted,
      startedAt: crawlRuns.startedAt,
      completedAt: crawlRuns.completedAt,
      sourceDomain: sources.domain,
    })
    .from(crawlRuns)
    .leftJoin(sources, eq(crawlRuns.sourceId, sources.id))
    .orderBy(desc(crawlRuns.startedAt))
    .limit(10);

  // ── Recent listings ──
  const recentListings = await db
    .select({
      id: properties.id,
      title: properties.title,
      city: properties.city,
      propertyType: properties.propertyType,
      status: properties.status,
      firstSeenAt: properties.firstSeenAt,
      contentEs: properties.contentEs,
      contentEn: properties.contentEn,
    })
    .from(properties)
    .orderBy(desc(properties.firstSeenAt))
    .limit(8);

  const cs = crawlStats[0];

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Pipeline overview
          </p>
          <AutoRefresh />
        </div>
      </div>

      {/* ── Top stats ── */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Properties" value={totalProps} />
        <StatCard label="Images" value={imageCount?.value ?? 0} />
        <StatCard label="Sources" value={sourceCount?.value ?? 0} />
        <StatCard label="Crawl Runs" value={crawlCount?.value ?? 0} />
        <StatCard
          label="Est. Cost"
          value={`$${costTotal.toFixed(2)}`}
          sub="proxy + LLM"
        />
      </div>

      {/* ── Pipeline ── */}
      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Pipeline Progress
      </h2>
      <div className="grid grid-cols-4 gap-3">
        <PipelineCard
          label="Extracted only"
          value={extractedCount}
          total={totalProps}
          color="bg-orange-500"
        />
        <PipelineCard
          label="Paraphrased (ES)"
          value={totalProps - extractedCount}
          total={totalProps}
          color="bg-blue-500"
        />
        <PipelineCard
          label="Translated (EN+FR)"
          value={fullyTranslated}
          total={totalProps}
          color="bg-green-500"
        />
        <PipelineCard
          label="Images downloaded"
          value={imageCount?.value ?? 0}
          total={totalProps * 16}
          color="bg-purple-500"
          sub={`~${Math.round((imageCount?.value ?? 0) / Math.max(totalProps, 1))} avg/listing`}
        />
      </div>

      {/* ── Cost breakdown ── */}
      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Estimated Costs (LLM + Proxy)
      </h2>
      <div className="grid grid-cols-4 gap-3">
        <CostCard label="Proxy (DataImpulse)" value={costProxy} />
        <CostCard label="Extraction (Haiku)" value={costExtraction} />
        <CostCard label="Paraphrase (Sonnet)" value={costParaphrase} />
        <CostCard label="Translate (Sonnet)" value={costTranslate} />
      </div>

      {/* ── Breakdowns ── */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        {/* Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {statusCounts.map((s) => (
                <li key={s.status} className="flex items-center justify-between text-sm">
                  <StatusBadge status={s.status} />
                  <span className="tabular-nums text-muted-foreground">{s.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* City */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By City (top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {cityCounts.map((c) => (
                <li key={c.city} className="flex items-center justify-between text-sm">
                  <span>{c.city}</span>
                  <span className="tabular-nums text-muted-foreground">{c.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {typeCounts.map((t) => (
                <li key={t.propertyType} className="flex items-center justify-between text-sm">
                  <span>{t.propertyType}</span>
                  <span className="tabular-nums text-muted-foreground">{t.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ── Crawl runs + Recent listings ── */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Crawl Runs ({cs?.completed ?? 0} ok / {cs?.failed ?? 0} fail / {cs?.running ?? 0} running)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ul className="space-y-2">
              {recentCrawls.map((c) => (
                <li key={c.id} className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {c.sourceDomain ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.pagesCrawled ?? 0} pages · {c.listingsExtracted ?? 0} extracted
                      {c.completedAt
                        ? ` · ${formatDuration(c.startedAt, c.completedAt)}`
                        : ""}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

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
            <ul className="space-y-2">
              {recentListings.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/admin/listings/${l.id}`}
                    className="group flex items-start justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium group-hover:text-primary">
                        {l.title.replace(/&#\d+;/g, "'").replace(/&amp;/g, "&")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {l.city} · {l.propertyType}
                        {l.contentEs ? " · ES" : ""}
                        {l.contentEn ? " · EN" : ""}
                      </p>
                    </div>
                    <StatusBadge status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Components ──

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</div>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function PipelineCard({
  label,
  value,
  total,
  color,
  sub,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  sub?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold tabular-nums">
          {value.toLocaleString()}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            / {total.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
          <div
            className={`h-1.5 rounded-full ${color}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {pct}%{sub ? ` · ${sub}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function CostCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-bold tabular-nums">
          ${value.toFixed(2)}
        </div>
      </CardContent>
    </Card>
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

  return (
    <Badge variant={variant} className="text-[11px]">
      {status}
    </Badge>
  );
}

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}
