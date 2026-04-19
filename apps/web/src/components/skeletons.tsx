import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function SkeletonStatCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-border",
        className,
      )}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 6 }: { cols?: number }) {
  return (
    <div className="grid items-center gap-4 border-b border-border/60 px-4 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4" />
      ))}
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-64 w-full flex-col justify-end gap-2 rounded-xl bg-card p-6 ring-1 ring-border", className)}>
      <div className="flex h-full items-end gap-2">
        {[50, 35, 68, 40, 82, 55, 72].map((h, i) => (
          <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
