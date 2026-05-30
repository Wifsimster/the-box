import { Skeleton } from '@/components/ui/skeleton'

export function ProfileSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="rounded-xl border-2 border-primary/20 p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 lg:min-w-[280px]">
            <Skeleton className="size-24 rounded-full" />
            <div className="flex-1 space-y-3 w-full">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-y-2">
                <Skeleton className="size-10 rounded-full" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <Skeleton className="h-10 w-72 mx-auto" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    </div>
  )
}
