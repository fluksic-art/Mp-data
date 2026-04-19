import { SkeletonStatCard, SkeletonChart } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-12" aria-busy="true" aria-live="polite">
      <div className="space-y-3 pb-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="grid gap-4 md:grid-cols-12">
        <div className="md:col-span-5">
          <SkeletonStatCard className="h-full min-h-48" />
        </div>
        <div className="grid gap-3 md:col-span-7 md:grid-cols-2">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
      </div>

      <div>
        <Skeleton className="mb-4 h-3 w-24" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    </div>
  );
}
