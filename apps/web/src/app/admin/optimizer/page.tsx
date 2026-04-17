import { getDb } from "@/lib/db";
import { properties, optimizerCampaigns } from "@mpgenesis/database";
import { count, desc, ne, sql, asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFixForRule } from "@mpgenesis/shared";
import { CreateCampaignButton } from "./campaign-card";
import { CampaignCard } from "./campaign-card";

export const dynamic = "force-dynamic";

interface IssueByRule {
  rule: string;
  category: string;
  severity: string;
  occurrences: number;
}

export default async function OptimizerPage() {
  const db = getDb();

  const issuesByRule: IssueByRule[] = await db
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

  const ranked = issuesByRule
    .map((r) => ({
      ...r,
      impact: r.occurrences * (r.severity === "error" ? 3 : r.severity === "warning" ? 1 : 0),
      fix: getFixForRule(r.rule),
    }))
    .sort((a, b) => b.impact - a.impact);

  const campaigns = await db
    .select()
    .from(optimizerCampaigns)
    .orderBy(desc(optimizerCampaigns.createdAt))
    .limit(20);

  const activeCampaignRules = new Set(
    campaigns
      .filter((c) => !["done", "failed"].includes(c.status))
      .map((c) => c.rule),
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Optimizer</h1>
        <p className="text-sm text-muted-foreground">
          Remediación controlada de issues identificados por el Supervisor.
          Crea campañas, prueba en batch, revisa y aplica.
        </p>
      </div>

      {/* Campaigns section */}
      {campaigns.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Campañas</h2>
          <div className="space-y-3">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        </div>
      )}

      {/* Issues table */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Issues prioritarios</h2>
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regla</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Severidad</TableHead>
                <TableHead className="text-right">Ocurrencias</TableHead>
                <TableHead className="text-right">Impact</TableHead>
                <TableHead>Fix sugerido</TableHead>
                <TableHead className="w-36"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Sin issues. Ejecuta el supervisor primero.
                  </TableCell>
                </TableRow>
              ) : (
                ranked.map((r) => (
                  <TableRow key={`${r.rule}-${r.severity}`}>
                    <TableCell className="font-mono text-xs">{r.rule}</TableCell>
                    <TableCell className="text-xs">{r.category}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={r.severity} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.occurrences}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {r.impact}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.fix ? (
                        <span className="text-primary">{r.fix.label}</span>
                      ) : (
                        <span className="text-muted-foreground">Manual</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.fix && !activeCampaignRules.has(r.rule) ? (
                        <CreateCampaignButton
                          rule={r.rule}
                          severity={r.severity}
                          category={r.category}
                        />
                      ) : activeCampaignRules.has(r.rule) ? (
                        <Badge variant="outline" className="text-[10px]">
                          Campaña activa
                        </Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "error")
    return <Badge variant="destructive">error</Badge>;
  if (severity === "warning") return <Badge variant="secondary">warning</Badge>;
  return <Badge variant="outline">info</Badge>;
}
