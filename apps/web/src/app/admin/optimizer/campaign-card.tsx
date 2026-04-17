"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  createCampaign,
  runTestBatch,
  completeTest,
  approveAndRollout,
  cancelCampaign,
} from "./actions";

interface TestSnapshot {
  propertyId: string;
  score: number | null;
  issues: unknown[];
}

interface CampaignData {
  id: string;
  rule: string;
  severity: string;
  category: string;
  fixAction: string;
  status: string;
  totalAffected: number;
  testIds: string[];
  testBefore: unknown;
  testAfter: unknown;
  rolloutFixed: number;
  rolloutFailed: number;
  createdAt: Date;
}

export function CreateCampaignButton({
  rule,
  severity,
  category,
}: {
  rule: string;
  severity: string;
  category: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await createCampaign(rule, severity, category);
          router.refresh();
        })
      }
      className="text-xs"
    >
      {isPending ? "Creando..." : "Crear campaña"}
    </Button>
  );
}

export function CampaignCard({ campaign }: { campaign: CampaignData }) {
  const c = campaign;
  const statusColor = STATUS_COLORS[c.status] ?? "outline";

  return (
    <Card>
      <CardContent className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">{c.rule}</span>
              <Badge variant={statusColor as any}>{c.status}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {c.fixAction} · {c.totalAffected} afectados · {c.testIds.length} en test batch
            </p>
          </div>
          <CampaignActions campaign={c} />
        </div>

        {c.status === "review" && <ReviewTable campaign={c} />}

        {c.status === "running" && (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Progreso:</span>
              <span className="font-semibold tabular-nums">
                {c.rolloutFixed + c.rolloutFailed} / {c.totalAffected - c.testIds.length}
              </span>
              {c.rolloutFailed > 0 && (
                <span className="text-xs text-red-600">({c.rolloutFailed} fallidos)</span>
              )}
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${Math.min(100, ((c.rolloutFixed + c.rolloutFailed) / Math.max(1, c.totalAffected - c.testIds.length)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {c.status === "done" && (
          <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            Completado: {c.rolloutFixed} corregidos
            {c.rolloutFailed > 0 && `, ${c.rolloutFailed} fallidos`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CampaignActions({ campaign }: { campaign: CampaignData }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const act = (fn: () => Promise<{ error?: string } | unknown>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result && typeof result === "object" && "error" in result && result.error) {
        setError(String(result.error));
        return;
      }
      router.refresh();
    });

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}
      <div className="flex gap-2">
      {campaign.status === "draft" && (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => act(() => runTestBatch(campaign.id))}
        >
          {isPending ? "Ejecutando..." : "Ejecutar test"}
        </Button>
      )}
      {campaign.status === "testing" && (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => act(() => completeTest(campaign.id))}
        >
          {isPending ? "Cargando..." : "Ver resultados"}
        </Button>
      )}
      {campaign.status === "review" && (
        <>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => act(() => approveAndRollout(campaign.id))}
          >
            {isPending ? "Aplicando..." : "Aprobar y aplicar a todos"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => act(() => cancelCampaign(campaign.id))}
          >
            Cancelar
          </Button>
        </>
      )}
      {(campaign.status === "draft" || campaign.status === "testing") && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => act(() => cancelCampaign(campaign.id))}
          className="text-muted-foreground"
        >
          Cancelar
        </Button>
      )}
    </div>
    </div>
  );
}

function ReviewTable({ campaign }: { campaign: CampaignData }) {
  const before = (campaign.testBefore ?? []) as TestSnapshot[];
  const after = (campaign.testAfter ?? []) as TestSnapshot[];
  const afterMap = new Map(after.map((a) => [a.propertyId, a]));

  return (
    <div className="mt-4 overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium">Property ID</th>
            <th className="px-3 py-2 text-right font-medium">Score antes</th>
            <th className="px-3 py-2 text-right font-medium">Score después</th>
            <th className="px-3 py-2 text-right font-medium">Issues (regla)</th>
            <th className="px-3 py-2 text-center font-medium">Resuelto</th>
          </tr>
        </thead>
        <tbody>
          {before.map((b) => {
            const a = afterMap.get(b.propertyId);
            const resolved = a ? a.issues.length === 0 : false;
            const scoreDelta =
              a?.score != null && b.score != null ? a.score - b.score : null;

            return (
              <tr key={b.propertyId} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono">{b.propertyId.slice(0, 8)}...</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {b.score ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {a?.score ?? "—"}
                  {scoreDelta != null && scoreDelta !== 0 && (
                    <span
                      className={`ml-1 ${scoreDelta > 0 ? "text-emerald-600" : "text-red-600"}`}
                    >
                      {scoreDelta > 0 ? "+" : ""}
                      {scoreDelta}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {b.issues.length} → {a?.issues.length ?? "?"}
                </td>
                <td className="px-3 py-2 text-center">
                  {a ? (
                    resolved ? (
                      <span className="text-emerald-600 font-semibold">✓</span>
                    ) : (
                      <span className="text-red-600">✗</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">pendiente</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "outline",
  testing: "secondary",
  review: "secondary",
  running: "default",
  done: "default",
  failed: "destructive",
};
