"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, Archive } from "lucide-react";
import { updatePropertyStatus } from "./actions";
import { cn } from "@/lib/utils";

export function DuplicateActions({ propertyId }: { propertyId: string }) {
  const [pending, startTransition] = useTransition();

  const run = (status: "draft" | "archived") => {
    startTransition(async () => {
      const res = await updatePropertyStatus(propertyId, status);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  };

  return (
    <div className="flex gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => run("draft")}
        className={cn(
          "inline-flex items-center gap-1 rounded border border-success/40 px-1.5 py-0.5 text-[10px] font-medium text-success transition-colors hover:bg-success/10",
          "disabled:opacity-50",
        )}
      >
        <Check className="size-2.5" />
        Aprobar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run("archived")}
        className={cn(
          "inline-flex items-center gap-1 rounded border border-destructive/40 px-1.5 py-0.5 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/10",
          "disabled:opacity-50",
        )}
      >
        <Archive className="size-2.5" />
        Archivar
      </button>
    </div>
  );
}
