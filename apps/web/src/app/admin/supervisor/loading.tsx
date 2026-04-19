import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonStatCard, SkeletonTableRow } from "@/components/skeletons";

export default function SupervisorLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="space-y-3 pb-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-border">
        <Skeleton className="h-4 w-40" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <SkeletonTableRow cols={5} />
        <SkeletonTableRow cols={5} />
        <SkeletonTableRow cols={5} />
        <SkeletonTableRow cols={5} />
      </div>
    </div>
  );
}
