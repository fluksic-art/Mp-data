"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  createCampaign,
  runTestBatch,
  completeTest,
  approveAndRollout,
  verifyResults,
  cancelCampaign,
} from "./actions";

interface PropertySnapshot {
  propertyId: string;
  score: number | null;
  issues: unknown[];
  title: string;
  contentPreview: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  bedrooms: number | null;
  bathrooms: string | number | null;
  priceCents: number | null;
  state: string | null;
  city: string | null;
  hasContentEs: boolean;
  hasContentEn: boolean;
  hasContentFr: boolean;
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
          const toastId = toast.loading("Creando campaña…");
          try {
            await createCampaign(rule, severity, category);
            toast.success(`Campaña creada para ${rule}`, { id: toastId });
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Error inesperado", { id: toastId });
          }
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

  return (
    <Card>
      <CardContent className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">{c.rule}</span>
              <StatusBadge status={c.status} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {c.fixAction} · {c.totalAffected} afectados · {c.testIds.length} en test batch
            </p>
          </div>
          <CampaignActions campaign={c} />
        </div>

        {(c.status === "review" || c.status === "done" || c.status === "awaiting_workers") && (
          <ReviewTable campaign={c} />
        )}

        {c.status === "running" && (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Encolando jobs:</span>
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

        {c.status === "awaiting_workers" && (
          <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            {c.rolloutFixed} jobs encolados. Esperando que los workers procesen.
            Usa "Verificar resultados" para comprobar el progreso.
          </div>
        )}

        {c.status === "done" && (
          <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            Verificado y completado.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: string; label: string }> = {
    draft: { variant: "outline", label: "draft" },
    testing: { variant: "secondary", label: "testing" },
    review: { variant: "secondary", label: "review" },
    running: { variant: "default", label: "running" },
    awaiting_workers: { variant: "secondary", label: "esperando workers" },
    done: { variant: "default", label: "done" },
    failed: { variant: "destructive", label: "cancelado" },
  };
  const m = map[status] ?? { variant: "outline", label: status };
  return <Badge variant={m.variant as any}>{m.label}</Badge>;
}

function CampaignActions({ campaign }: { campaign: CampaignData }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const act = (label: string, fn: () => Promise<{ error?: string } | unknown>) =>
    startTransition(async () => {
      const toastId = toast.loading(label);
      try {
        const result = await fn();
        if (result && typeof result === "object" && "error" in result && result.error) {
          toast.error(String(result.error), { id: toastId });
          return;
        }
        toast.success(`${label} ✓`, { id: toastId });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error inesperado", { id: toastId });
      }
    });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {campaign.status === "draft" && (
          <Button size="sm" disabled={isPending} onClick={() => act("Ejecutando test", () => runTestBatch(campaign.id))}>
            {isPending ? "Ejecutando..." : "Ejecutar test"}
          </Button>
        )}
        {campaign.status === "testing" && (
          <Button size="sm" disabled={isPending} onClick={() => act("Cargando resultados", () => completeTest(campaign.id))}>
            {isPending ? "Cargando..." : "Ver resultados"}
          </Button>
        )}
        {campaign.status === "review" && (
          <>
            <Button size="sm" disabled={isPending} onClick={() => act("Aplicando rollout", () => approveAndRollout(campaign.id))}>
              {isPending ? "Aplicando..." : "Aprobar y aplicar a todos"}
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => act("Cancelando campaña", () => cancelCampaign(campaign.id))}>
              Cancelar
            </Button>
          </>
        )}
        {campaign.status === "awaiting_workers" && (
          <Button size="sm" disabled={isPending} onClick={() => act("Verificando resultados", () => verifyResults(campaign.id))}>
            {isPending ? "Verificando..." : "Verificar resultados"}
          </Button>
        )}
        {["draft", "testing", "awaiting_workers"].includes(campaign.status) && (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => act("Cancelando campaña", () => cancelCampaign(campaign.id))} className="text-muted-foreground">
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewTable({ campaign }: { campaign: CampaignData }) {
  const before = (campaign.testBefore ?? []) as PropertySnapshot[];
  const after = (campaign.testAfter ?? []) as PropertySnapshot[];
  const afterMap = new Map(after.map((a) => [a.propertyId, a]));
  const fixAction = campaign.fixAction;

  return (
    <div className="mt-4 space-y-3">
      {before.map((b) => {
        const a = afterMap.get(b.propertyId);
        const resolved = a ? a.issues.length === 0 && b.issues.length > 0 : false;
        const changed = a ? hasChanges(b, a, fixAction) : false;

        return (
          <details key={b.propertyId} className="group rounded-md border">
            <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50">
              <span className="font-mono text-xs text-muted-foreground">
                {b.propertyId.slice(0, 8)}
              </span>
              <span className="truncate flex-1 text-xs">{b.title}</span>
              <span className="tabular-nums text-xs">
                {b.score ?? "—"} → {a?.score ?? "—"}
              </span>
              <span className="text-xs">
                {a ? (
                  resolved ? (
                    <span className="font-semibold text-emerald-600">Resuelto</span>
                  ) : changed ? (
                    <span className="font-semibold text-amber-600">Cambió</span>
                  ) : (
                    <span className="text-muted-foreground">Sin cambios</span>
                  )
                ) : (
                  <span className="text-muted-foreground">Pendiente</span>
                )}
              </span>
            </summary>

            <div className="border-t bg-muted/20 px-4 py-3 space-y-2 text-xs">
              {/* Content diff */}
              {fixAction === "reprocess_paraphrase" && (
                <>
                  <DiffRow label="Contenido ES" before={b.hasContentEs ? "✓" : "✗"} after={a?.hasContentEs ? "✓" : "✗"} />
                  <DiffRow label="Contenido EN" before={b.hasContentEn ? "✓" : "✗"} after={a?.hasContentEn ? "✓" : "✗"} />
                  <DiffRow label="Contenido FR" before={b.hasContentFr ? "✓" : "✗"} after={a?.hasContentFr ? "✓" : "✗"} />
                  {b.metaTitle !== a?.metaTitle && (
                    <DiffRow label="Meta title" before={b.metaTitle} after={a?.metaTitle} />
                  )}
                  {b.metaDescription !== a?.metaDescription && (
                    <DiffRow label="Meta description" before={b.metaDescription} after={a?.metaDescription} />
                  )}
                  {b.contentPreview !== a?.contentPreview && (
                    <DiffBlock label="Descripción" before={b.contentPreview} after={a?.contentPreview} />
                  )}
                </>
              )}

              {fixAction === "retranslate" && (
                <>
                  <DiffRow label="Contenido EN" before={b.hasContentEn ? "✓" : "✗"} after={a?.hasContentEn ? "✓" : "✗"} />
                  <DiffRow label="Contenido FR" before={b.hasContentFr ? "✓" : "✗"} after={a?.hasContentFr ? "✓" : "✗"} />
                </>
              )}

              {(fixAction === "re_enrich" || fixAction === "data_patch") && (
                <>
                  <DiffRow label="Bedrooms" before={String(b.bedrooms ?? "—")} after={String(a?.bedrooms ?? "—")} />
                  <DiffRow label="Price" before={b.priceCents ? `$${(b.priceCents / 100).toLocaleString()}` : "—"} after={a?.priceCents ? `$${(a.priceCents / 100).toLocaleString()}` : "—"} />
                  <DiffRow label="State" before={b.state ?? "—"} after={a?.state ?? "—"} />
                  <DiffRow label="City" before={b.city ?? "—"} after={a?.city ?? "—"} />
                </>
              )}

              {/* Issues */}
              <div className="pt-1 border-t">
                <span className="text-muted-foreground">Issues ({campaign.rule}): </span>
                <span>{b.issues.length} → {a?.issues.length ?? "?"}</span>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function DiffRow({ label, before, after }: { label: string; before: string | null | undefined; after: string | null | undefined }) {
  const changed = before !== after;
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      {changed ? (
        <>
          <span className="line-through text-red-600/70">{before ?? "—"}</span>
          <span className="text-muted-foreground">→</span>
          <span className="text-emerald-700 font-medium">{after ?? "—"}</span>
        </>
      ) : (
        <span>{before ?? "—"}</span>
      )}
    </div>
  );
}

function DiffBlock({ label, before, after }: { label: string; before: string | null | undefined; after: string | null | undefined }) {
  if (!before && !after) return null;
  const changed = before !== after;
  if (!changed) return null;

  return (
    <div className="space-y-1 pt-1">
      <span className="text-muted-foreground">{label}:</span>
      {before && (
        <div className="rounded bg-red-50 px-2 py-1 text-red-800 dark:bg-red-950/20 dark:text-red-300 line-through text-[11px] leading-relaxed max-h-24 overflow-auto">
          {before}
        </div>
      )}
      {after && (
        <div className="rounded bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300 text-[11px] leading-relaxed max-h-24 overflow-auto">
          {after}
        </div>
      )}
    </div>
  );
}

function hasChanges(before: PropertySnapshot, after: PropertySnapshot, fixAction: string): boolean {
  if (before.score !== after.score) return true;
  if (before.hasContentEs !== after.hasContentEs) return true;
  if (before.hasContentEn !== after.hasContentEn) return true;
  if (before.contentPreview !== after.contentPreview) return true;
  if (before.metaTitle !== after.metaTitle) return true;
  if (fixAction === "re_enrich" || fixAction === "data_patch") {
    if (before.bedrooms !== after.bedrooms) return true;
    if (before.priceCents !== after.priceCents) return true;
    if (before.state !== after.state) return true;
  }
  return false;
}
