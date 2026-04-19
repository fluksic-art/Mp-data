import Link from "next/link";
import { getDb } from "@/lib/db";
import {
  properties,
  sources,
  crawlRuns,
  propertyImages,
} from "@mpgenesis/database";
import { count, desc, eq, sql, and, isNotNull } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AutoRefresh } from "./listings/auto-refresh";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const db = getDb();

  const [propertyCount] = await db.select({ value: count() }).from(properties);
  const [sourceCount] = await db.select({ value: count() }).from(sources);
  const [crawlCount] = await db.select({ value: count() }).from(crawlRuns);
  const [imageCount] = await db.select({ value: count() }).from(propertyImages);

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

  const statusCounts = await db
    .select({ status: properties.status, count: count() })
    .from(properties)
    .groupBy(properties.status);

  const cityCounts = await db
    .select({ city: properties.city, count: count() })
    .from(properties)
    .groupBy(properties.city)
    .orderBy(desc(count()))
    .limit(10);

  const typeCounts = await db
    .select({ propertyType: properties.propertyType, count: count() })
    .from(properties)
    .groupBy(properties.propertyType)
    .orderBy(desc(count()));

  const crawlStats = await db
    .select({
      totalPages: sql<number>`COALESCE(SUM(${crawlRuns.pagesCrawled}), 0)`,
      totalExtracted: sql<number>`COALESCE(SUM(${crawlRuns.listingsExtracted}), 0)`,
      completed: sql<number>`COUNT(*) FILTER (WHERE ${crawlRuns.status} = 'completed')`,
      failed: sql<number>`COUNT(*) FILTER (WHERE ${crawlRuns.status} = 'failed')`,
      running: sql<number>`COUNT(*) FILTER (WHERE ${crawlRuns.status} = 'running')`,
    })
    .from(crawlRuns);

  const totalProps = propertyCount?.value ?? 0;
  const tier3Count = Math.round(totalProps * 0.7);
  const extractedCount = extracted?.value ?? 0;
  const _paraphrasedCount = paraphrased?.value ?? 0;
  const translatedCount = translated?.value ?? 0;
  const fullyTranslated = translated?.value ?? 0;

  const costExtraction = tier3Count * 0.005;
  const costParaphrase = (totalProps - extractedCount) * 0.017;
  const costTranslate = fullyTranslated * 0.04;
  const costProxy = 0.78;
  const costTotal = costExtraction + costParaphrase + costTranslate + costProxy;

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
    .limit(8);

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

  const translatedPct = totalProps > 0 ? (translatedCount / totalProps) * 100 : 0;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Pipeline · Fase 1"
        title="Panorama general"
        description="Cobertura actual del pipeline, estado de los listings y costos estimados en tiempo real."
      />
      <AutoRefresh />

      <section className="grid gap-4 md:grid-cols-12">
        <StatCard
          variant="hero"
          label="Propiedades indexadas"
          value={totalProps}
          deltaPct={translatedPct}
          deltaLabel={`${translatedCount.toLocaleString()} traducidas a EN+FR`}
          className="md:col-span-5"
        />
        <div className="grid gap-3 md:col-span-7 md:grid-cols-2">
          <StatCard label="Imágenes" value={imageCount?.value ?? 0} />
          <StatCard label="Fuentes" value={sourceCount?.value ?? 0} />
          <StatCard label="Crawl Runs" value={crawlCount?.value ?? 0} />
          <StatCard
            label="Costo estimado"
            value={Number(costTotal.toFixed(2))}
            prefix="$"
            format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
          />
        </div>
      </section>

      <section>
        <SectionHeading>Pipeline</SectionHeading>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PipelineCard
            label="Solo extraído"
            value={extractedCount}
            total={totalProps}
            accent="var(--chart-4)"
          />
          <PipelineCard
            label="Parafraseado (ES)"
            value={totalProps - extractedCount}
            total={totalProps}
            accent="var(--chart-2)"
          />
          <PipelineCard
            label="Traducido (EN+FR)"
            value={fullyTranslated}
            total={totalProps}
            accent="var(--chart-3)"
          />
          <PipelineCard
            label="Imágenes descargadas"
            value={imageCount?.value ?? 0}
            total={totalProps * 16}
            accent="var(--chart-5)"
            sub={`~${Math.round((imageCount?.value ?? 0) / Math.max(totalProps, 1))} avg/listing`}
          />
        </div>
      </section>

      <section>
        <SectionHeading>Costos estimados</SectionHeading>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CostCard label="Proxy (DataImpulse)" value={costProxy} />
          <CostCard label="Extracción (Haiku)" value={costExtraction} />
          <CostCard label="Paráfrasis (Sonnet)" value={costParaphrase} />
          <CostCard label="Traducción (Sonnet)" value={costTranslate} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <BreakdownCard title="Por estado">
          <BreakdownList
            items={statusCounts.map((s) => ({
              key: s.status,
              left: <StatusBadge status={s.status} />,
              right: s.count,
            }))}
          />
        </BreakdownCard>
        <BreakdownCard title="Por ciudad (top 10)">
          <BreakdownList
            items={cityCounts.map((c) => ({
              key: c.city ?? "—",
              left: c.city,
              right: c.count,
            }))}
          />
        </BreakdownCard>
        <BreakdownCard title="Por tipo">
          <BreakdownList
            items={typeCounts.map((t) => ({
              key: t.propertyType ?? "—",
              left: t.propertyType,
              right: t.count,
            }))}
          />
        </BreakdownCard>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Crawl Runs · {cs?.completed ?? 0} ok / {cs?.failed ?? 0} fail / {cs?.running ?? 0} running
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ul className="space-y-2.5">
              {recentCrawls.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {c.sourceDomain ?? "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
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
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Listings recientes</CardTitle>
              <Link
                href="/admin/listings"
                className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Ver todos
                <ArrowUpRight className="size-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ul className="space-y-2.5">
              {recentListings.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/admin/listings/${l.id}`}
                    className="group flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                        {l.title.replace(/&#\d+;/g, "'").replace(/&amp;/g, "&")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
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
      </section>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-eyebrow flex items-center gap-3">
      {children}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </h2>
  );
}

function PipelineCard({
  label,
  value,
  total,
  accent,
  sub,
}: {
  label: string;
  value: number;
  total: number;
  accent: string;
  sub?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-border">
      <p className="text-eyebrow">{label}</p>
      <p className="text-xl font-semibold tabular-nums">
        {value.toLocaleString()}
        <span className="ml-1.5 text-sm font-normal text-muted-foreground">
          / {total.toLocaleString()}
        </span>
      </p>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${label}: ${pct}%`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: accent }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {pct}%{sub ? ` · ${sub}` : ""}
      </p>
    </div>
  );
}

function CostCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-border">
      <p className="text-eyebrow">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">
        ${value.toFixed(2)}
      </p>
    </div>
  );
}

function BreakdownCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function BreakdownList({
  items,
}: {
  items: { key: string; left: React.ReactNode; right: number }[];
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li
          key={i.key}
          className="flex items-center justify-between text-sm"
        >
          <span className="truncate">{i.left}</span>
          <span className="tabular-nums text-muted-foreground">
            {i.right.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
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
