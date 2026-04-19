import { Skeleton } from "@/components/ui/skeleton";

export default function ListingDetailLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <Skeleton className="h-4 w-48" />
      <div className="mt-4 space-y-3">
        <Skeleton className="aspect-[21/9] w-full rounded-xl" />
        <div className="flex gap-2 overflow-hidden">
          <Skeleton className="aspect-[4/3] w-32 rounded-lg" />
          <Skeleton className="aspect-[4/3] w-32 rounded-lg" />
          <Skeleton className="aspect-[4/3] w-32 rounded-lg" />
          <Skeleton className="aspect-[4/3] w-32 rounded-lg" />
        </div>
      </div>

      <div className="mt-8 space-y-3 border-b border-border pb-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
