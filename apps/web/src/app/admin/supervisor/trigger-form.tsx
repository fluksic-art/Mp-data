"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const handleRun = () => {
    const toastId = toast.loading("Encolando batch…");
    startTransition(async () => {
      try {
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
        if (res.queued > 0) {
          toast.success(`${res.queued} jobs encolados`, { id: toastId });
        } else {
          toast.info("No hay listings que coincidan con el filtro", { id: toastId });
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error inesperado", { id: toastId });
      }
    });
  };

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-border">
      <div className="mb-4 flex items-baseline gap-3">
        <h3 className="text-eyebrow">Ejecutar supervisor</h3>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ts-status" className="text-xs">Status (coma-separado)</Label>
          <Input
            id="ts-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="review,published"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ts-type" className="text-xs">Tipo de propiedad</Label>
          <Select
            value={propertyType || "_all"}
            onValueChange={(v) =>
              setPropertyType(v == null || v === "_all" ? "" : String(v))
            }
          >
            <SelectTrigger id="ts-type" className="w-full">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos</SelectItem>
              {propertyTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ts-days" className="text-xs">Older than (días)</Label>
          <Input
            id="ts-days"
            type="number"
            min={0}
            value={olderThanDays}
            onChange={(e) => setOlderThanDays(e.target.value)}
            placeholder="30"
          />
        </div>

        <div className="flex flex-col gap-1.5 pt-5 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={staleOnly}
              onChange={(e) => setStaleOnly(e.target.checked)}
              className="size-3.5 rounded border-border"
            />
            <span>Solo stale (versión distinta a la actual)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="size-3.5 rounded border-border"
            />
            <span>Forzar (re-evaluar aunque estén al día)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={skipJudge}
              onChange={(e) => setSkipJudge(e.target.checked)}
              className="size-3.5 rounded border-border"
            />
            <span>Saltar LLM judge (solo reglas deterministas)</span>
          </label>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button size="sm" disabled={isPending} onClick={handleRun}>
          {isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Encolando…
            </>
          ) : (
            <>
              <Play className="size-3.5" />
              Ejecutar batch
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
