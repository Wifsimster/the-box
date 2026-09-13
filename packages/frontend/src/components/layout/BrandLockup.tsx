import { Link } from 'react-router-dom'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { SITE_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'

interface BrandLockupProps {
  /** Called after navigating home — lets the mobile drawer close itself. */
  onNavigate?: () => void
  className?: string
}

/**
 * Mark + wordmark, linking home. Mounted in the header on every route.
 *
 * Before this existed the brand appeared on exactly one screen: a 12px eyebrow
 * above the home hero. A player who opened the installed PWA straight onto
 * /play never saw The Box at all. See docs/brand.md §4.
 *
 * The wordmark is hidden below `sm` — on a 320px phone the header already
 * carries the menu trigger and the reward widgets, and the mark alone is
 * recognisable once it is the only logo in the chrome.
 */
export function BrandLockup({ onNavigate, className }: BrandLockupProps) {
  const { localizedPath } = useLocalizedPath()

  return (
    <Link
      to={localizedPath('/')}
      onClick={onNavigate}
      aria-label={SITE_NAME}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-md px-1 py-1 transition-opacity hover:opacity-80',
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
