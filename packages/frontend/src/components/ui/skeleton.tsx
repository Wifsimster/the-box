import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular'
}

export function Skeleton({
  className,
  variant = 'rectangular',
  ...props
}: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'skeleton',
        variant === 'circular' && 'rounded-full',
        variant === 'text' && 'h-4 rounded',
        variant === 'rectangular' && 'rounded-lg',
        className
      )}
      {...props}
    />
  )
}

// Pre-built skeleton patterns for common use cases
export function JobCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg bg-muted/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-4" variant="circular" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-40" variant="text" />
            <Skeleton className="h-3 w-32" variant="text" />
          </div>
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-2 w-full" />
    </div>
  )
}
