"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { triggerSupervisorBatch } from "./actions";

interface Props {
  propertyTypes: string[];
}

export function TriggerForm({ propertyTypes }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string>("review,published");
  const [propertyType, setPropertyType] = useState<string>("");
  const [staleOnly, setStaleOnly] = useState(true);
  const [olderThanDays, setOlderThanDays] = useState<string>("");
  const [force, setForce] = useState(false);
  const [skipJudge, setSkipJudge] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleRun = () => {
    startTransition(async () => {
      setResult("Encolando…");
      const filter: Parameters<typeof triggerSupervisorBatch>[0] = {
        status: status.split(",").map((s) => s.trim()).filter(Boolean),
        stale: staleOnly,
        force,
        skipJudge,
      };
      if (propertyType) filter.propertyType = propertyType;
      if (olderThanDays) {
        const n = Number(olderThanDays);
        if (Number.isFinite(n) && n > 0) filter.olderThanDays = n;
      }
      const res = await triggerSupervisorBatch(filter);
      setResult(
        res.queued > 0
          ? `✓ ${res.queued} jobs encolados`
          : `No hay listings que coincidan con el filtro`,
      );
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Ejecutar supervisor</h3>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Status (coma-separado)</span>
          <input
            type="text"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="review,published"
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Property type</span>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {propertyTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Older than (days)</span>
          <input
            type="number"
            min={0}
            value={olderThanDays}
            onChange={(e) => setOlderThanDays(e.target.value)}
            placeholder="30"
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex flex-col gap-1.5 pt-4 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={staleOnly}
              onChange={(e) => setStaleOnly(e.target.checked)}
            />
            <span>Solo stale (versión distinta a la actual)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            <span>Forzar (re-evaluar aunque estén al día)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={skipJudge}
              onChange={(e) => setSkipJudge(e.target.checked)}
            />
            <span>Saltar LLM judge (solo reglas deterministas)</span>
          </label>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" disabled={isPending} onClick={handleRun}>
          {isPending ? "Encolando…" : "Ejecutar batch"}
        </Button>
        {result && (
          <span className="text-xs text-muted-foreground">{result}</span>
        )}
      </div>
    </div>
  );
}
