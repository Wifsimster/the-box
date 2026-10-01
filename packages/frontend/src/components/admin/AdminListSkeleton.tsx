import { Skeleton } from '@/components/ui/skeleton'

interface AdminListSkeletonProps {
  rows?: number
}

/** Placeholder rows shaped like the admin list cards (mobile) / table rows (md+). */
export function AdminListSkeleton({ rows = 5 }: AdminListSkeletonProps) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-lg border border-border p-3 md:p-0 md:border-0 md:border-b md:rounded-none md:pb-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 md:w-1/3" variant="text" />
              <Skeleton className="h-3 w-1/2 md:w-1/4" variant="text" />
            </div>
            <Skeleton className="size-9 shrink-0" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </div>
      ))}
    </div>
  )
}
