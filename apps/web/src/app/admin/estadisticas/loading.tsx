import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonStatCard, SkeletonChart } from "@/components/skeletons";

export default function EstadisticasLoading() {
  return (
    <div className="space-y-10" aria-busy="true" aria-live="polite">
      <div className="space-y-3 pb-6">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SkeletonChart />
        <SkeletonChart />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    </div>
  );
}
