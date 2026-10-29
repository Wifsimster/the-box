import { Link } from 'react-router-dom'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { SITE_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'

interface BrandLockupProps {
  onNavigate?: () => void
  className?: string
}

export function BrandLockup({ onNavigate, className }: BrandLockupProps) {
  const { localizedPath } = useLocalizedPath()

  return (
    <Link
      to={localizedPath('/')}
      onClick={onNavigate}
      aria-label={SITE_NAME}
      className={cn(
        'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-md px-1 py-1 transition-opacity hover:opacity-80',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <img src="/logo.svg" alt="" aria-hidden="true" className="size-7 sm:size-8" />
      <span className="hidden text-base font-semibold tracking-tight sm:inline">
        {SITE_NAME}
      </span>
    </Link>
  )
}
