import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonTableRow } from "@/components/skeletons";

export default function ListingsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-3 pb-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="flex items-center gap-3">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-7 w-28" />
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-48" />
        </div>
        <SkeletonTableRow cols={6} />
        <SkeletonTableRow cols={6} />
        <SkeletonTableRow cols={6} />
        <SkeletonTableRow cols={6} />
        <SkeletonTableRow cols={6} />
        <SkeletonTableRow cols={6} />
      </div>
    </div>
  );
}
