import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonTableRow } from "@/components/skeletons";

export default function OptimizerLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="space-y-3 pb-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <SkeletonTableRow cols={6} />
        <SkeletonTableRow cols={6} />
        <SkeletonTableRow cols={6} />
        <SkeletonTableRow cols={6} />
      </div>
    </div>
  );
}
