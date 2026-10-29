import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BOTTOM_NAV } from '@/components/layout/nav-items'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'
import { cn } from '@/lib/utils'

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
        'border-t border-border/60 bg-background',
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
                    'text-xs font-medium transition-colors',
                    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
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
