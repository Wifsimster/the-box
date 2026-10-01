import { Skeleton } from '@/components/ui/skeleton'

export function ProfileSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6" aria-busy="true">
      <div className="rounded-xl border border-primary/40 p-(--card-padding)">
        <div className="flex flex-col lg:flex-row gap-5 lg:gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 lg:min-w-[280px]">
            <Skeleton className="size-24 sm:size-32 rounded-full" />
            <div className="flex-1 flex flex-col items-center sm:items-start space-y-3 w-full">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-y-2 p-2">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <Skeleton className="h-11 w-full max-w-3xl mx-auto" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    </div>
  )
}
