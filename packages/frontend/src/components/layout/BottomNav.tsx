import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BOTTOM_NAV } from '@/components/layout/nav-items'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'
import { cn } from '@/lib/utils'

/**
 * Persistent bottom navigation bar for mobile viewports.
 *
 * Hidden at the `md` breakpoint and up (the desktop Header carries primary
 * navigation) through a pure CSS `md:hidden` gate, and unmounted while the
 * virtual keyboard is open so it never floats on top of a keyboard on form
 * pages such as /login or /contact.
 *
 * `LanguageLayout` mounts this and gates it off the fullscreen Geo and in-game
 * `/play` routes. The bar reserves `env(safe-area-inset-bottom)` so its tap
 * targets clear the iOS home indicator / Android gesture bar.
 */
export function BottomNav() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const { isKeyboardOpen } = useKeyboardHeight()

  if (isKeyboardOpen) return null

  return (
    <nav
      aria-label={t('nav.mobile')}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 md:hidden',
        'border-t border-border/60 bg-background/95 backdrop-blur-md',
        'supports-[backdrop-filter]:bg-background/80',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="mx-auto flex h-[var(--bottom-nav-h)] max-w-md items-stretch">
        {BOTTOM_NAV.map((item) => {
          const Icon = item.icon
          return (
            <li key={item.key} className="flex-1">
              <NavLink
                to={localizedPath(item.path)}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-full flex-col items-center justify-center gap-1 px-1',
                    'text-[11px] font-medium transition-colors',
                    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Non-text active indicator — a primary-coloured top bar,
                        readable independently of the icon/label colour. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary transition-opacity',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon className="size-5 shrink-0" aria-hidden="true" />
                    <span className="leading-none">{t(item.labelKey)}</span>
                  </>
                )}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
