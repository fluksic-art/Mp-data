"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SupervisorIssue } from "@mpgenesis/shared";
import {
  triggerSupervisorSingle,
  resolveSupervisorIssue,
} from "@/app/admin/supervisor/actions";

interface Props {
  propertyId: string;
  supervisorScore: number | null;
  supervisorFactualScore: number | null;
  supervisorContentScore: number | null;
  supervisorIssues: SupervisorIssue[] | null;
  supervisorSummary: string | null;
  supervisorCheckedAt: Date | null;
  supervisorCheckVersion: string | null;
  qaStatus: string | null;
}

export function SupervisorReport(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const issues = props.supervisorIssues ?? [];
  const errorIssues = issues.filter((i) => i.severity === "error");
  const warningIssues = issues.filter((i) => i.severity === "warning");
  const infoIssues = issues.filter((i) => i.severity === "info");

  const handleRun = (force: boolean) => {
    startTransition(async () => {
      setActionMessage("Encolando…");
      const res = await triggerSupervisorSingle(props.propertyId, { force });
      setActionMessage(
        res.queued ? "✓ Job encolado, espera unos segundos y recarga" : "No se pudo encolar",
      );
      router.refresh();
    });
  };

  const handleResolve = (rule: string) => {
    startTransition(async () => {
      await resolveSupervisorIssue(props.propertyId, rule);
      router.refresh();
    });
  };

  const neverChecked = !props.supervisorCheckedAt;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              Supervisor Report
              {props.supervisorCheckVersion && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {props.supervisorCheckVersion}
                </span>
              )}
            </CardTitle>
            {props.supervisorCheckedAt && (
              <p className="text-xs text-muted-foreground">
                Último check: {props.supervisorCheckedAt.toLocaleString("es-MX")}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={isPending}
              onClick={() => handleRun(false)}
            >
              {neverChecked ? "Supervisar" : "Re-supervisar"}
            </Button>
            {!neverChecked && (
              <Button
                size="xs"
                variant="outline"
                disabled={isPending}
                onClick={() => handleRun(true)}
              >
                Force
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {neverChecked ? (
          <p className="text-sm text-muted-foreground">
            Este listing no ha sido supervisado todavía.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <ScoreBox label="Total" score={props.supervisorScore} />
              <ScoreBox label="Factual" score={props.supervisorFactualScore} />
              <ScoreBox label="Content" score={props.supervisorContentScore} />
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">QA:</span>
              <QaBadge qa={props.qaStatus} />
            </div>
            {props.supervisorSummary && (
              <p className="rounded-md border bg-muted/40 p-3 text-sm italic text-muted-foreground">
                {props.supervisorSummary}
              </p>
            )}
            <IssueList
              title={`Errores (${errorIssues.length})`}
              issues={errorIssues}
              onResolve={handleResolve}
              disabled={isPending}
            />
            <IssueList
              title={`Warnings (${warningIssues.length})`}
              issues={warningIssues}
              onResolve={handleResolve}
              disabled={isPending}
            />
            {infoIssues.length > 0 && (
              <IssueList
                title={`Info (${infoIssues.length})`}
                issues={infoIssues}
                onResolve={handleResolve}
                disabled={isPending}
              />
            )}
          </>
        )}
        {actionMessage && (
          <p className="text-xs text-muted-foreground">{actionMessage}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreBox({ label, score }: { label: string; score: number | null }) {
  const tone =
    score === null
      ? "bg-muted"
      : score >= 85
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        : score >= 70
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  return (
    <div className={`rounded-md px-3 py-2 ${tone}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{score ?? "—"}</p>
    </div>
  );
}

function QaBadge({ qa }: { qa: string | null }) {
  if (!qa) return <Badge variant="outline">—</Badge>;
  if (qa === "ok") return <Badge variant="outline">ok</Badge>;
  if (qa === "needs_review") return <Badge variant="secondary">needs_review</Badge>;
  return <Badge variant="destructive">blocked</Badge>;
}

function IssueList({
  title,
  issues,
  onResolve,
  disabled,
}: {
  title: string;
  issues: SupervisorIssue[];
  onResolve: (rule: string) => void;
  disabled: boolean;
}) {
  if (issues.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1.5">
        {issues.map((issue, idx) => (
          <li
            key={`${issue.rule}-${idx}`}
            className="flex items-start justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px]">{issue.rule}</span>
                <Badge variant="outline" className="text-[10px]">
                  {issue.category}
                </Badge>
                {issue.field && (
                  <span className="text-[11px] text-muted-foreground">
                    @ {issue.field}
                  </span>
                )}
                {issue.locale && (
                  <span className="text-[11px] text-muted-foreground">
                    [{issue.locale}]
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm">{issue.message}</p>
            </div>
            <Button
              size="xs"
              variant="ghost"
              disabled={disabled}
              onClick={() => onResolve(issue.rule)}
              title="Marcar como aceptado por humano"
            >
              ✓
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
