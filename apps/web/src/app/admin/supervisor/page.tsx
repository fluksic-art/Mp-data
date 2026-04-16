import React from "react";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { properties, sources } from "@mpgenesis/database";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
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
import { SUPERVISOR_CHECK_VERSION, type SupervisorIssue } from "@mpgenesis/shared";
import { TriggerForm } from "./trigger-form";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function str(val: string | string[] | undefined): string | undefined {
  return typeof val === "string" ? val : undefined;
}

export default async function SupervisorPage({ searchParams }: Props) {
  const params = await searchParams;
  const db = getDb();

  const rule = str(params.rule);
  const severity = str(params.severity);
  const propertyType = str(params.propertyType);
  const qaStatus = str(params.qaStatus);
  const onlyIssues = str(params.onlyIssues) === "1";

  const conditions: SQL[] = [ne(properties.status, "possible_duplicate")];
  if (propertyType) conditions.push(eq(properties.propertyType, propertyType));
  if (qaStatus) conditions.push(eq(properties.qaStatus, qaStatus));
  if (rule)
    conditions.push(
      sql`exists (select 1 from jsonb_array_elements(coalesce(${properties.supervisorIssues}, '[]'::jsonb)) as i where i->>'rule' = ${rule})`,
    );
  if (severity)
    conditions.push(
      sql`exists (select 1 from jsonb_array_elements(coalesce(${properties.supervisorIssues}, '[]'::jsonb)) as i where i->>'severity' = ${severity})`,
    );
  if (onlyIssues)
    conditions.push(
      sql`jsonb_array_length(coalesce(${properties.supervisorIssues}, '[]'::jsonb)) > 0`,
    );
  const where = and(...conditions);

  // Aggregate stats
  const [totalChecked, needsReviewRow, blockedRow, avgScoreRow] = await Promise.all([
    db
      .select({ value: count() })
      .from(properties)
      .where(and(isNotNull(properties.supervisorCheckedAt), ne(properties.status, "possible_duplicate"))),
    db
      .select({ value: count() })
      .from(properties)
      .where(and(eq(properties.qaStatus, "needs_review"), ne(properties.status, "possible_duplicate"))),
    db
      .select({ value: count() })
      .from(properties)
      .where(and(eq(properties.qaStatus, "blocked"), ne(properties.status, "possible_duplicate"))),
    db
      .select({
        value: sql<number | null>`avg(${properties.supervisorScore})::float`,
      })
      .from(properties)
      .where(and(isNotNull(properties.supervisorScore), ne(properties.status, "possible_duplicate"))),
  ]);

  // Worst scored listings (top 20)
  const worst = await db
    .select({
      id: properties.id,
      title: properties.title,
      propertyType: properties.propertyType,
      supervisorScore: properties.supervisorScore,
      factualScore: properties.supervisorFactualScore,
      contentScore: properties.supervisorContentScore,
      qaStatus: properties.qaStatus,
      issues: properties.supervisorIssues,
      checkedAt: properties.supervisorCheckedAt,
      status: properties.status,
      sourceDomain: sources.domain,
    })
    .from(properties)
    .leftJoin(sources, eq(properties.sourceId, sources.id))
    .where(and(isNotNull(properties.supervisorCheckedAt), ...conditions))
    .orderBy(asc(properties.supervisorScore), desc(properties.supervisorCheckedAt))
    .limit(20);

  // Aggregate issues by rule
  const issuesByRule = await db
    .select({
      rule: sql<string>`rule_obj->>'rule'`,
      category: sql<string>`rule_obj->>'category'`,
      severity: sql<string>`rule_obj->>'severity'`,
      occurrences: count(),
    })
    .from(
      sql`${properties}, jsonb_array_elements(coalesce(${properties.supervisorIssues}, '[]'::jsonb)) as rule_obj`,
    )
    .where(sql`${properties.status} != 'possible_duplicate'`)
    .groupBy(
      sql`rule_obj->>'rule'`,
      sql`rule_obj->>'category'`,
      sql`rule_obj->>'severity'`,
    )
    .orderBy(desc(count()));

  // Pre-fetch top 5 affected listings per rule for inline expansion
  const uniqueRules = [...new Set(issuesByRule.map((r) => r.rule))];
  const listingsByRule = new Map<string, Array<{ id: string; title: string; score: number | null }>>();
  await Promise.all(
    uniqueRules.slice(0, 15).map(async (ruleName) => {
      const rows = await db
        .select({
          id: properties.id,
          title: properties.title,
          score: properties.supervisorScore,
        })
        .from(properties)
        .where(
          and(
            sql`exists (select 1 from jsonb_array_elements(coalesce(${properties.supervisorIssues}, '[]'::jsonb)) as i where i->>'rule' = ${ruleName})`,
            ne(properties.status, "possible_duplicate"),
          ),
        )
        .orderBy(asc(properties.supervisorScore))
        .limit(5);
      listingsByRule.set(ruleName, rows);
    }),
  );

  const propertyTypes = await db
    .selectDistinct({ propertyType: properties.propertyType })
    .from(properties)
    .orderBy(asc(properties.propertyType));

  const avgScore = avgScoreRow[0]?.value ?? null;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Supervisor</h1>
        <p className="text-sm text-muted-foreground">
          Auditoría de inconsistencias factuales + calidad de descripción contra el manual Propyte.{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
            check v{SUPERVISOR_CHECK_VERSION}
          </span>
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Revisados" value={String(totalChecked[0]?.value ?? 0)} />
        <Stat
          label="Needs review"
          value={String(needsReviewRow[0]?.value ?? 0)}
          accent={
            (needsReviewRow[0]?.value ?? 0) > 0 ? "warning" : undefined
          }
        />
        <Stat
          label="Blocked"
          value={String(blockedRow[0]?.value ?? 0)}
          accent={(blockedRow[0]?.value ?? 0) > 0 ? "error" : undefined}
        />
        <Stat
          label="Score promedio"
          value={avgScore !== null ? avgScore.toFixed(1) : "—"}
        />
      </div>

      <TriggerForm propertyTypes={propertyTypes.map((p) => p.propertyType)} />

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Issues por regla</h2>
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regla</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Severidad</TableHead>
                <TableHead className="text-right">Ocurrencias</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issuesByRule.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Ningún issue registrado todavía.
                  </TableCell>
                </TableRow>
              ) : (
                issuesByRule.map((r) => {
                  const affected = listingsByRule.get(r.rule) ?? [];
                  return (
                    <React.Fragment key={`${r.rule}-${r.severity}`}>
                      <TableRow>
                        <TableCell className="font-mono text-xs">{r.rule}</TableCell>
                        <TableCell className="text-xs">{r.category}</TableCell>
                        <TableCell>
                          <SeverityBadge severity={r.severity} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.occurrences}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/admin/listings?supervisorRule=${encodeURIComponent(r.rule)}`}
                            className="text-xs text-primary underline-offset-2 hover:underline"
                          >
                            Ver todos →
                          </Link>
                        </TableCell>
                      </TableRow>
                      {affected.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/30 px-6 py-2">
                            <details className="group">
                              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                                Top {affected.length} listings afectados
                              </summary>
                              <ul className="mt-2 space-y-1">
                                {affected.map((l) => (
                                  <li key={l.id} className="flex items-center gap-2 text-xs">
                                    <ScorePill score={l.score} />
                                    <Link
                                      href={`/admin/listings/${l.id}`}
                                      className="truncate text-primary underline-offset-2 hover:underline"
                                    >
                                      {l.title}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {(rule || severity) && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Filtrando por:</span>
          {rule && <Badge variant="secondary">rule: {rule}</Badge>}
          {severity && <Badge variant="secondary">severity: {severity}</Badge>}
          <Link
            href="/admin/supervisor"
            className="ml-auto text-xs text-primary underline-offset-2 hover:underline"
          >
            Limpiar filtro
          </Link>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Peor puntuados</h2>
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Fact / Cont</TableHead>
                <TableHead>QA</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {worst.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Sin resultados. Ejecuta el supervisor sobre un batch.
                  </TableCell>
                </TableRow>
              ) : (
                worst.map((r) => {
                  const issues = (r.issues ?? []) as SupervisorIssue[];
                  const errorCount = issues.filter(
                    (i) => i.severity === "error",
                  ).length;
                  const warnCount = issues.filter(
                    (i) => i.severity === "warning",
                  ).length;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-xs">
                        <Link
                          href={`/admin/listings/${r.id}`}
                          className="block truncate text-sm hover:text-primary"
                        >
                          {r.title}
                        </Link>
                        <span className="text-[11px] text-muted-foreground">
                          {r.sourceDomain ?? ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{r.propertyType}</TableCell>
                      <TableCell>
                        <ScorePill score={r.supervisorScore} />
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {r.factualScore ?? "—"} / {r.contentScore ?? "—"}
                      </TableCell>
                      <TableCell>
                        <QaBadge qa={r.qaStatus} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {errorCount > 0 && (
                          <Badge variant="destructive" className="mr-1">
                            {errorCount} err
                          </Badge>
                        )}
                        {warnCount > 0 && (
                          <Badge variant="secondary">{warnCount} warn</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/admin/listings/${r.id}`}
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Ver →
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {rule || severity || propertyType || qaStatus || onlyIssues ? (
        <div className="mt-4 text-xs">
          <Link
            href="/admin/supervisor"
            className="text-primary underline-offset-2 hover:underline"
          >
            ← limpiar filtros
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "warning" | "error";
}) {
  const tone =
    accent === "error"
      ? "text-red-600 dark:text-red-400"
      : accent === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>
        {value}
      </p>
    </div>
  );
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone =
    score >= 85
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : score >= 70
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  return (
    <span
      className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}
    >
      {score}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "error")
    return <Badge variant="destructive">error</Badge>;
  if (severity === "warning") return <Badge variant="secondary">warning</Badge>;
  return <Badge variant="outline">info</Badge>;
}

function QaBadge({ qa }: { qa: string | null }) {
  if (!qa) return <span className="text-xs text-muted-foreground">—</span>;
  if (qa === "ok") return <Badge variant="outline">ok</Badge>;
  if (qa === "needs_review")
    return <Badge variant="secondary">needs_review</Badge>;
  return <Badge variant="destructive">blocked</Badge>;
}
