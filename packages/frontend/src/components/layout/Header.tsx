import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Menu, User, ChevronDown, History, LogOut, Settings, Sparkles, LifeBuoy, Compass, Shield } from 'lucide-react'
import { PRIMARY_NAV, type NavLinkItem } from '@/components/layout/nav-items'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useAuth } from '@/hooks/useAuth'
import { DailyRewardBadge } from '@/components/daily-login'
import { RewardsInboxBell } from '@/components/rewards'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { useBillingStore } from '@/stores/billingStore'
import { KoeSupportWidget } from '@/components/layout/KoeSupportWidget'
import { InstallPromptButton } from '@/components/pwa'
import { requestTourReplay } from '@/components/onboarding/tour-storage'
import { cn } from '@/lib/utils'

// The premium link is an upsell rendered conditionally, so it lives outside the
// shared PRIMARY_NAV array. It still routes through NavItemLink so it picks up
// active-route styling and `aria-current` on /premium.
const PREMIUM_NAV_ITEM: NavLinkItem = {
  key: 'premium',
  labelKey: 'common.premium',
  icon: Sparkles,
  path: '/premium',
}

/**
 * A single primary-navigation destination, rendered as a react-router NavLink
 * so the active route gets `aria-current="page"` automatically. Two layouts:
 * `desktop` (inline, top bar) and `drawer` (full-width, mobile menu).
 */
function NavItemLink({
  item,
  variant,
  accent = false,
  onNavigate,
}: {
  item: NavLinkItem
  variant: 'desktop' | 'drawer'
  /** Premium tint — neon-pink idle colour for the upsell link. */
  accent?: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const Icon = item.icon

  return (
    <NavLink
      to={localizedPath(item.path)}
      end={item.end}
      onClick={onNavigate}
      data-tour={item.dataTour}
      className={({ isActive }) =>
        cn(
          'inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm transition-colors',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          variant === 'drawer' && 'w-full justify-start',
          isActive
            ? 'font-semibold text-primary'
            : accent
              ? 'font-medium text-neon-pink hover:bg-muted hover:text-neon-pink/80'
              : 'font-medium text-foreground/80 hover:bg-muted hover:text-foreground',
          // Non-text active indicators: an inset underline on desktop, a tinted
          // surface in the drawer — both readable without relying on colour.
          variant === 'desktop' && isActive && 'shadow-[inset_0_-2px_0_0_var(--color-primary)]',
          variant === 'drawer' && isActive && 'bg-primary/10',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t(item.labelKey)}</span>
      {item.badgeKey && (
        <Badge
          variant="outline"
          className="ml-1 h-4 px-1 text-[10px] font-semibold uppercase tracking-wide border-neon-pink/50 text-neon-pink"
        >
          {t(item.badgeKey)}
        </Badge>
      )}
    </NavLink>
  )
}

// Koe widget owns its own launcher and panel state internally — there is no
// imperative open API. Clicking the floating launcher button toggles the
// panel, so we reuse that same DOM seam to open it from the account menu.
const isKoeConfigured = Boolean(
  import.meta.env.VITE_KOE_PROJECT_KEY && import.meta.env.VITE_KOE_API_URL,
)

function openKoeSupport() {
  const launcher = document.querySelector<HTMLButtonElement>(
    '.koe-root button[aria-expanded="false"]',
  )
  launcher?.click()
}

type AccountEntry =
  | { type: 'link'; key: string; icon: LucideIcon; label: string; to: string; iconClassName?: string }
  | { type: 'action'; key: string; icon: LucideIcon; label: string; onSelect: () => void }
  | { type: 'separator'; key: string }

/**
 * The signed-in account menu. The set of entries is declared once here and
 * rendered for both the mobile drawer (`Button` rows) and the desktop dropdown
 * (`DropdownMenuItem` rows), so the two never drift apart.
 */
function AccountMenu({
  variant,
  isAdmin,
  isPremium,
  onNavigate,
  onReplayTour,
  onSignOut,
}: {
  variant: 'drawer' | 'dropdown'
  isAdmin: boolean
  isPremium: boolean
  /** Drawer only — closes the Sheet after a selection. */
  onNavigate?: () => void
  onReplayTour: () => void
  onSignOut: () => void
}) {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()

  const entries: AccountEntry[] = [
    { type: 'link', key: 'profile', icon: User, label: t('common.profile'), to: localizedPath('/profile') },
    { type: 'link', key: 'security', icon: Shield, label: t('security.title'), to: localizedPath('/settings/security') },
    { type: 'link', key: 'history', icon: History, label: t('common.history'), to: localizedPath('/history') },
    {
      type: 'link',
      key: 'premium',
      icon: Sparkles,
      iconClassName: 'text-neon-pink',
      label: isPremium ? t('common.manageSubscription') : t('common.subscribeToPremium'),
      to: localizedPath('/premium'),
    },
    ...(isKoeConfigured
      ? [{ type: 'action', key: 'support', icon: LifeBuoy, label: t('common.support'), onSelect: openKoeSupport } as AccountEntry]
      : []),
    ...(isAdmin
      ? [{ type: 'link', key: 'admin', icon: Settings, label: t('common.admin'), to: localizedPath('/admin') } as AccountEntry]
      : []),
    { type: 'separator', key: 'sep' },
    { type: 'action', key: 'tour', icon: Compass, label: t('tour.replayCta'), onSelect: onReplayTour },
    { type: 'action', key: 'logout', icon: LogOut, label: t('common.logout'), onSelect: onSignOut },
  ]

  if (variant === 'drawer') {
    return (
      <div className="flex flex-col gap-1">
        {entries.map((entry) => {
          if (entry.type === 'separator') {
            return <div key={entry.key} className="my-1 border-t border-border" />
          }
          const Icon = entry.icon
          if (entry.type === 'link') {
            return (
              <Button key={entry.key} variant="ghost" asChild className="h-11 w-full justify-start gap-2 px-3">
                <Link to={entry.to} onClick={onNavigate}>
                  <Icon className={cn('h-4 w-4 shrink-0', entry.iconClassName)} aria-hidden="true" />
                  {entry.label}
                </Link>
              </Button>
            )
          }
          return (
            <Button
              key={entry.key}
              variant="ghost"
              className="h-11 w-full justify-start gap-2 px-3"
              onClick={() => {
                onNavigate?.()
                entry.onSelect()
              }}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {entry.label}
            </Button>
          )
        })}
      </div>
    )
  }

  return (
    <>
      {entries.map((entry) => {
        if (entry.type === 'separator') {
          return <DropdownMenuSeparator key={entry.key} />
        }
        const Icon = entry.icon
        if (entry.type === 'link') {
          return (
            <DropdownMenuItem key={entry.key} asChild>
              <Link to={entry.to} className="flex cursor-pointer items-center gap-2">
                <Icon className={cn('h-4 w-4', entry.iconClassName)} aria-hidden="true" />
                {entry.label}
              </Link>
            </DropdownMenuItem>
          )
        }
        return (
          <DropdownMenuItem
            key={entry.key}
            onClick={entry.onSelect}
            className="flex cursor-pointer items-center gap-2"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {entry.label}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

/**
 * Header component
 *
 * Sticky app header. On mobile it carries a hamburger that opens the full
 * navigation drawer plus the daily-reward widgets; on desktop it shows the
 * primary nav inline alongside the account dropdown. Primary navigation is
 * driven by the shared `PRIMARY_NAV` config so the drawer, the desktop bar and
 * the mobile BottomNav stay in sync.
 */
export function Header() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const navigate = useNavigate()
  const { session, isPending, signOut } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  const handleReplayTour = () => {
    requestTourReplay()
    navigate(localizedPath('/'))
  }
  const isRewardModalOpen = useDailyLoginStore((state) => state.isModalOpen)
  const closeRewardModal = useDailyLoginStore((state) => state.closeModal)
  const billingEntitlement = useBillingStore((state) => state.entitlement)
  const fetchBillingEntitlement = useBillingStore((state) => state.fetchEntitlement)
  const isPremium = Boolean(billingEntitlement?.isPremium)
  const showPremiumUpsell = !isPremium

  // Hydrate billing entitlement once we know who the user is. Anonymous
  // visitors get a 401 → store falls back to FREE_ENTITLEMENT silently.
  useEffect(() => {
    void fetchBillingEntitlement()
  }, [fetchBillingEntitlement, session?.user?.id])

  // Keep the mobile menu and the daily reward modal mutually exclusive so the
  // modal can't render underneath the Sheet on small screens.
  useEffect(() => {
    if (mobileMenuOpen && isRewardModalOpen) {
      closeRewardModal()
    }
  }, [mobileMenuOpen, isRewardModalOpen, closeRewardModal])

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Show login/register buttons if there's no session. Also check the session
  // is valid (has user data) — the session endpoint can return invalid data.
  const hasValidSession = session && session.user && session.user.id
  const showAuthButtons = !hasValidSession
  const isAdmin = session?.user?.role === 'admin'
  const displayName = session?.user?.name || session?.user?.email?.split('@')[0]
  const isSignedIn = Boolean(hasValidSession) && !isPending

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-md transition-colors duration-200',
        // Pad the status bar so content clears the iOS notch when the app runs
        // as an installed PWA (apple-mobile-web-app-status-bar-style is
        // black-translucent). Resolves to 0 in a normal browser tab.
        'pt-[env(safe-area-inset-top)]',
        isScrolled
          ? 'border-border/40 bg-background/80 supports-[backdrop-filter]:bg-background/70 shadow-md shadow-black/20'
          : 'border-border/20 bg-transparent',
      )}
    >
      <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-4">
        {/* Mobile menu trigger — shown below md */}
        <div className="flex md:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11" aria-label={t('common.toggleMenu')}>
                <Menu className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">{t('common.toggleMenu')}</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] overflow-y-auto sm:w-[340px]">
              <SheetHeader>
                <SheetTitle className="text-left">{t('common.menu')}</SheetTitle>
                <SheetDescription className="sr-only">
                  {t('common.menuDescription', 'Site navigation and account links')}
                </SheetDescription>
              </SheetHeader>

              <nav aria-label={t('nav.mobile')} className="mt-6 flex flex-col gap-1">
                {PRIMARY_NAV.map((item) => (
                  <NavItemLink
                    key={item.key}
                    item={item}
                    variant="drawer"
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                ))}
                {showPremiumUpsell && (
                  <NavItemLink
                    item={PREMIUM_NAV_ITEM}
                    variant="drawer"
                    accent
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                )}
              </nav>

              <div className="mt-4">
                <InstallPromptButton variant="mobile" onInstalled={() => setMobileMenuOpen(false)} />
              </div>

              <div className="mt-4 border-t border-border pt-4">
                {showAuthButtons ? (
                  <div className="flex flex-col gap-2">
                    <Button variant="ghost" asChild className="h-11 w-full justify-start px-3">
                      <Link to={localizedPath('/login')} onClick={() => setMobileMenuOpen(false)}>
                        {t('common.login')}
                      </Link>
                    </Button>
                    <Button variant="gaming" asChild className="h-11 w-full">
                      <Link to={localizedPath('/register')} onClick={() => setMobileMenuOpen(false)}>
                        {t('common.register')}
                      </Link>
                    </Button>
                  </div>
                ) : (
                  isSignedIn && (
                    <AccountMenu
                      variant="drawer"
                      isAdmin={isAdmin}
                      isPremium={isPremium}
                      onNavigate={() => setMobileMenuOpen(false)}
                      onReplayTour={handleReplayTour}
                      onSignOut={signOut}
                    />
                  )
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop primary navigation — shown at md and up */}
        <nav aria-label={t('nav.primary')} className="hidden items-center gap-1 md:flex lg:gap-2">
          {PRIMARY_NAV.map((item) => (
            <NavItemLink key={item.key} item={item} variant="desktop" />
          ))}
          {showPremiumUpsell && <NavItemLink item={PREMIUM_NAV_ITEM} variant="desktop" accent />}
        </nav>

        {/* Mobile reward widgets — surfaced in the header (not buried in the
            drawer) so the daily-streak loop is glanceable on first paint */}
        <div className="flex items-center gap-1 md:hidden">
          {isSignedIn && (
            <>
              <RewardsInboxBell />
              <DailyRewardBadge />
            </>
          )}
        </div>

        {/* Desktop account zone — shown at md and up */}
        <div className="hidden items-center gap-2 md:flex lg:gap-3">
          <InstallPromptButton variant="desktop" />
          {showAuthButtons && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to={localizedPath('/login')}>{t('common.login')}</Link>
              </Button>
              <Button variant="gaming" size="sm" asChild>
                <Link to={localizedPath('/register')}>{t('common.register')}</Link>
              </Button>
            </>
          )}
          {isSignedIn && (
            <>
              <RewardsInboxBell />
              <span data-tour="daily-reward-badge" className="inline-flex">
                <DailyRewardBadge />
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-tour="profile-menu"
                    className="flex items-center gap-2 border-0 hover:bg-primary/10"
                  >
                    <User className="h-4 w-4" aria-hidden="true" />
                    {isAdmin ? (
                      <Badge variant="admin" className="cursor-pointer text-xs">
                        {displayName}
                      </Badge>
                    ) : (
                      <span className="text-sm font-bold">{displayName}</span>
                    )}
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <AccountMenu
                    variant="dropdown"
                    isAdmin={isAdmin}
                    isPremium={isPremium}
                    onReplayTour={handleReplayTour}
                    onSignOut={signOut}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
      <KoeSupportWidget />
    </header>
  )
}
