import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { Menu, User, ChevronDown, LogOut, Settings, Sparkles, LifeBuoy } from 'lucide-react'
import { PRIMARY_NAV, SECONDARY_NAV, type NavLinkItem } from '@/components/layout/nav-items'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useAuth } from '@/hooks/useAuth'
import { useFeatures } from '@/hooks/useFeatures'
import { DailyRewardBadge } from '@/components/daily-login'
import { RewardsInboxBell } from '@/components/rewards'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { useBillingStore } from '@/stores/billingStore'
import { KoeSupportWidget } from '@/components/layout/KoeSupportWidget'
import { InstallPromptButton } from '@/components/pwa'
import { BrandLockup } from '@/components/layout/BrandLockup'
import { cn } from '@/lib/utils'
import { filterByFeatures } from '@/lib/dailyFirst'

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
      className={({ isActive }) =>
        cn(
          'relative inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm transition-colors',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          variant === 'drawer' && 'w-full justify-start',
          isActive
            ? 'font-semibold text-primary'
            : accent
              ? 'font-medium text-neon-pink hover:text-neon-pink/80'
              : 'font-medium text-foreground/70 hover:text-foreground',
          // Hover is a colour change only on desktop; the drawer keeps a
          // full-width surface because its rows are touch targets.
          variant === 'drawer' && !isActive && 'hover:bg-muted',
          // Desktop hover hint: a faint bar grows from the centre under the
          // label. The active bar itself is <NavActiveIndicator>, which slides
          // between links.
          variant === 'desktop' &&
            !isActive &&
            [
              'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground/25',
              'after:origin-center after:scale-x-0 hover:after:scale-x-100 focus-visible:after:scale-x-100',
              'after:transition-transform after:duration-200 after:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:after:transition-none',
            ],
          // Non-text active indicator in the drawer: a tinted surface.
          variant === 'drawer' && isActive && 'bg-primary/10',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
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

/** Horizontal inset of the bar inside a link: matches the link's `px-3`. */
const INDICATOR_INSET_PX = 12

/**
 * The active-link bar of the desktop nav. One element for the whole nav, so
 * on navigation it slides from the old link to the new one instead of
 * blinking. Position comes from the link carrying `aria-current="page"`
 * (set by NavLink); a ResizeObserver keeps it right when the labels change
 * width (language switch, web-font swap). The first placement is not
 * animated, and `prefers-reduced-motion` drops the slide.
 */
function NavActiveIndicator() {
  const { pathname } = useLocation()
  // Own ref, not the nav's: a child's layout effect runs before its parent's
  // ref is attached, so a ref passed down from <nav> is still null on mount.
  const barRef = useRef<HTMLSpanElement>(null)
  const [bar, setBar] = useState<{ x: number; width: number } | null>(null)
  const [animate, setAnimate] = useState(false)

  useLayoutEffect(() => {
    const nav = barRef.current?.parentElement
    if (!nav) return
    const placeOn = (link: HTMLElement | null) =>
      setBar(
        link
          ? {
              x: link.offsetLeft + INDICATOR_INSET_PX,
              width: Math.max(link.offsetWidth - INDICATOR_INSET_PX * 2, 0),
            }
          : null,
      )
    const measure = () => placeOn(nav.querySelector<HTMLElement>('a[aria-current="page"]'))
    // Move on click, not when the route commits: the router holds the old
    // location until the lazy page has loaded, which would make the bar lag
    // behind the tap. The aria-current measure confirms it afterwards.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest<HTMLElement>('a')
      if (link && nav.contains(link)) placeOn(link)
    }
    nav.addEventListener('click', onClick)
    measure()
    // Resize: label width changes (language switch, web-font swap).
    // Mutation: NavLink moves aria-current after the links re-render without
    // a pathname change (e.g. the language prefix resolving after mount).
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(nav)
    const mutationObserver = new MutationObserver(measure)
    mutationObserver.observe(nav, { subtree: true, childList: true, attributeFilter: ['aria-current'] })
    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      nav.removeEventListener('click', onClick)
    }
  }, [pathname])

  // Enable the transition only after the first placement has painted.
  useEffect(() => {
    if (bar && !animate) {
      const id = requestAnimationFrame(() => setAnimate(true))
      return () => cancelAnimationFrame(id)
    }
  }, [bar, animate])

  return (
    <span
      ref={barRef}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-primary',
        animate &&
          'transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
      )}
      style={{
        width: bar?.width ?? 0,
        transform: `translateX(${bar?.x ?? 0}px)`,
        opacity: bar ? 1 : 0,
      }}
    />
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
  onSignOut,
}: {
  variant: 'drawer' | 'dropdown'
  isAdmin: boolean
  isPremium: boolean
  /** Drawer only — closes the Sheet after a selection. */
  onNavigate?: () => void
  onSignOut: () => void
}) {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()

  const entries: AccountEntry[] = [
    // The former Profil / Sécurité / Historique / Gérer mon abonnement entries
    // are consolidated into the tabbed profile hub, reachable from this single
    // "Mon compte" link.
    { type: 'link', key: 'account', icon: User, label: t('common.account'), to: localizedPath('/profile') },
    // Premium stays an explicit upsell for free users; paying users manage their
    // plan inside the hub's Subscription tab, so it isn't repeated here.
    ...(!isPremium
      ? [
          {
            type: 'link',
            key: 'premium',
            icon: Sparkles,
            iconClassName: 'text-neon-pink',
            label: t('common.subscribeToPremium'),
            to: localizedPath('/premium'),
          } as AccountEntry,
        ]
      : []),
    ...(isKoeConfigured
      ? [{ type: 'action', key: 'support', icon: LifeBuoy, label: t('common.support'), onSelect: openKoeSupport } as AccountEntry]
      : []),
    ...(isAdmin
      ? [{ type: 'link', key: 'admin', icon: Settings, label: t('common.admin'), to: localizedPath('/admin') } as AccountEntry]
      : []),
    { type: 'separator', key: 'sep' },
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
                  <Icon className={cn('size-4 shrink-0', entry.iconClassName)} aria-hidden="true" />
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
              <Icon className="size-4 shrink-0" aria-hidden="true" />
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
                <Icon className={cn('size-4', entry.iconClassName)} aria-hidden="true" />
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
            <Icon className="size-4" aria-hidden="true" />
            {entry.label}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

// Subscribe the header to the window scroll position via an external store so
// the initial value is read during render (avoiding a mount-time setState) and
// SSR gets a stable "not scrolled" snapshot.
function subscribeScrolled(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}

function getScrolledSnapshot() {
  return window.scrollY > 8
}

function getScrolledServerSnapshot() {
  return false
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
const AUTH_PATH_RE = /\/(login|register|forgot-password|reset-password|two-factor)\/?$/

export function Header() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const { session, isPending, signOut } = useAuth()
  const features = useFeatures()
  // Drop nav entries whose runtime feature flag is off (the Geo entry when
  // GEO_COMMUNITY_ENABLED is off, Panorama when GEOGAMERS_ENABLED is off).
  const primaryNav = filterByFeatures(PRIMARY_NAV, features)
  const secondaryNav = filterByFeatures(SECONDARY_NAV, features)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isScrolled = useSyncExternalStore(
    subscribeScrolled,
    getScrolledSnapshot,
    getScrolledServerSnapshot,
  )

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
  // modal can't render underneath the Sheet on small screens. Handled directly
  // in `handleMobileMenuChange` (the menu's open handler) rather than via an
  // effect that watches the resulting state.
  const handleMobileMenuChange = (open: boolean) => {
    if (open && isRewardModalOpen) {
      closeRewardModal()
    }
    setMobileMenuOpen(open)
  }

  // Show login/register buttons if there's no session. Also check the session
  // is valid (has user data) — the session endpoint can return invalid data.
  // Guests (anonymous sessions) get them too: it's their only way to turn the
  // guest account into a real one, and the backend carries today's game over.
  const hasValidSession = session && session.user && session.user.id
  const isGuest = Boolean((session?.user as { isAnonymous?: boolean } | undefined)?.isAnonymous)
  const showAuthButtons = !hasValidSession || isGuest
  const isAdmin = session?.user?.role === 'admin'
  const displayName = session?.user?.name || session?.user?.email?.split('@')[0]
  // Uploaded avatar, exposed on the session (Better Auth additional field).
  const avatarUrl = (session?.user as { avatarUrl?: string | null } | undefined)?.avatarUrl ?? null
  const isSignedIn = Boolean(hasValidSession) && !isPending && !isGuest
  const { pathname } = useLocation()
  const isOnAuthPage = AUTH_PATH_RE.test(pathname)

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b transition-colors duration-200',
        // Pad the status bar so content clears the iOS notch when the app runs
        // as an installed PWA (apple-mobile-web-app-status-bar-style is
        // black-translucent). Resolves to 0 in a normal browser tab.
        'pt-[env(safe-area-inset-top)]',
        isScrolled
          ? 'border-border/40 bg-background shadow-md shadow-black/20'
          : 'border-border/20 bg-background',
      )}
    >
      <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-4">
        {/* Brand + navigation share the leading slot so the lockup always sits
            first, on every route and every breakpoint (docs/brand.md §4). */}
        <div className="flex items-center gap-1 md:gap-3">
          {/* Mobile menu trigger — shown below md */}
          <div className="flex md:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={handleMobileMenuChange}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="size-11" aria-label={t('common.toggleMenu')}>
                  <Menu className="size-5" aria-hidden="true" />
                  <span className="sr-only">{t('common.toggleMenu')}</span>
                </Button>
              </SheetTrigger>
              {/* `min(85vw, …)` instead of a flat 300px: on a 320px-wide phone a
                  fixed 300px drawer left a 20px strip of backdrop, which is not a
                  reachable tap-to-dismiss target. The cap keeps the drawer from
                  stretching on larger screens. */}
              <SheetContent side="left" className="w-[min(85vw,300px)] overflow-y-auto sm:w-[340px]">
                <SheetHeader>
                  <SheetTitle className="text-left">{t('common.menu')}</SheetTitle>
                  <SheetDescription className="sr-only">
                    {t('common.menuDescription', 'Site navigation and account links')}
                  </SheetDescription>
                </SheetHeader>

                <nav aria-label={t('nav.mobile')} className="mt-6 flex flex-col gap-1">
                  {primaryNav.map((item) => (
                    <NavItemLink
                      key={item.key}
                      item={item}
                      variant="drawer"
                      onNavigate={() => setMobileMenuOpen(false)}
                    />
                  ))}
                  <p className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('common.otherModes')}
                  </p>
                  {secondaryNav.map((item) => (
                    <NavItemLink
                      key={item.key}
                      item={item}
                      variant="drawer"
                      onNavigate={() => setMobileMenuOpen(false)}
                    />
                  ))}
                  {/* Signed-in free players already get "Passer Premium" in the
                      account block below; list it once. */}
                  {showPremiumUpsell && !isSignedIn && (
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
                        onSignOut={signOut}
                      />
                    )
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <BrandLockup onNavigate={() => setMobileMenuOpen(false)} />

          {/* Desktop primary navigation — shown at md and up */}
          <nav
            aria-label={t('nav.primary')}
            className="relative hidden items-center gap-1 md:flex lg:gap-2"
          >
            {/* Daily-first: only today's box and the results. Panorama and
                Premium are secondary (account menu, post-game loop, footer). */}
            {primaryNav.map((item) => (
              <NavItemLink key={item.key} item={item} variant="desktop" />
            ))}
            <NavActiveIndicator />
          </nav>
        </div>

        {/* Mobile reward widgets — surfaced in the header (not buried in the
            drawer) so the daily-streak loop is glanceable on first paint.
            Signed-out visitors get the login entry here instead, so it isn't
            hidden behind the hamburger. */}
        <div className="flex items-center gap-1 md:hidden">
          {showAuthButtons && !isPending && !isOnAuthPage && (
            <Button variant="outline" asChild className="px-3">
              <Link to={localizedPath('/login')}>{t('common.login')}</Link>
            </Button>
          )}
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
              <DailyRewardBadge />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-2 border-0 pl-1.5 hover:bg-primary/10"
                  >
                    <Avatar className="size-7 ring-1 ring-neon-purple/50">
                      <AvatarImage src={avatarUrl ?? undefined} alt="" className="object-cover" />
                      <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink text-xs font-bold text-white">
                        {displayName?.[0]?.toUpperCase() ?? <User className="size-4" aria-hidden="true" />}
                      </AvatarFallback>
                    </Avatar>
                    {isAdmin ? (
                      <Badge variant="admin" className="cursor-pointer text-xs">
                        {displayName}
                      </Badge>
                    ) : (
                      <span className="text-sm font-bold">{displayName}</span>
                    )}
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <AccountMenu
                    variant="dropdown"
                    isAdmin={isAdmin}
                    isPremium={isPremium}
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
