"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LayoutGrid, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ViewToggle({ current }: { current: "grid" | "table" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setView = (view: "grid" | "table") => {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "table") params.delete("view");
    else params.set("view", view);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div
      role="group"
      aria-label="Cambiar vista"
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5"
    >
      <button
        type="button"
        onClick={() => setView("grid")}
        aria-pressed={current === "grid"}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-[4px] px-2 text-[11px] font-medium transition-colors",
          current === "grid"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="size-3" />
        Grid
      </button>
      <button
        type="button"
        onClick={() => setView("table")}
        aria-pressed={current === "table"}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-[4px] px-2 text-[11px] font-medium transition-colors",
          current === "table"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Rows3 className="size-3" />
        Tabla
      </button>
    </div>
  );
}
