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

const PREMIUM_NAV_ITEM: NavLinkItem = {
  key: 'premium',
  labelKey: 'common.premium',
  icon: Sparkles,
  path: '/premium',
}

function NavItemLink({
  item,
  variant,
  accent = false,
  onNavigate,
}: {
  item: NavLinkItem
  variant: 'desktop' | 'drawer'
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
          variant === 'drawer' && !isActive && 'hover:bg-muted',
          variant === 'desktop' &&
            !isActive &&
            [
              'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground/25',
              'after:origin-center after:scale-x-0 hover:after:scale-x-100 focus-visible:after:scale-x-100',
              'after:transition-transform after:duration-200 after:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:after:transition-none',
            ],
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

const INDICATOR_INSET_PX = 12

function NavActiveIndicator() {
  const { pathname } = useLocation()
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
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest<HTMLElement>('a')
      if (link && nav.contains(link)) placeOn(link)
    }
    nav.addEventListener('click', onClick)
    measure()
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
  onNavigate?: () => void
  onSignOut: () => void
}) {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()

  const entries: AccountEntry[] = [
    { type: 'link', key: 'account', icon: User, label: t('common.account'), to: localizedPath('/profile') },
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

const AUTH_PATH_RE = /\/(login|register|forgot-password|reset-password|two-factor)\/?$/

export function Header() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const { session, isPending, signOut } = useAuth()
  const features = useFeatures()
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

  useEffect(() => {
    void fetchBillingEntitlement()
  }, [fetchBillingEntitlement, session?.user?.id])

  const handleMobileMenuChange = (open: boolean) => {
    if (open && isRewardModalOpen) {
      closeRewardModal()
    }
    setMobileMenuOpen(open)
  }

  const hasValidSession = session && session.user && session.user.id
  const isGuest = Boolean((session?.user as { isAnonymous?: boolean } | undefined)?.isAnonymous)
  const showAuthButtons = !hasValidSession || isGuest
  const isAdmin = session?.user?.role === 'admin'
  const displayName = session?.user?.name || session?.user?.email?.split('@')[0]
  const avatarUrl = (session?.user as { avatarUrl?: string | null } | undefined)?.avatarUrl ?? null
  const isSignedIn = Boolean(hasValidSession) && !isPending && !isGuest
  const { pathname } = useLocation()
  const isOnAuthPage = AUTH_PATH_RE.test(pathname)

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b transition-colors duration-200',
        'pt-[env(safe-area-inset-top)]',
        isScrolled
          ? 'border-border/40 bg-background shadow-md shadow-black/20'
          : 'border-border/20 bg-background',
      )}
    >
      <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-4">
        <div className="flex items-center gap-1 md:gap-3">
          <div className="flex md:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={handleMobileMenuChange}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="size-11" aria-label={t('common.toggleMenu')}>
                  <Menu className="size-5" aria-hidden="true" />
                  <span className="sr-only">{t('common.toggleMenu')}</span>
                </Button>
              </SheetTrigger>
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

          <nav
            aria-label={t('nav.primary')}
            className="relative hidden items-center gap-1 md:flex lg:gap-2"
          >
            {primaryNav.map((item) => (
              <NavItemLink key={item.key} item={item} variant="desktop" />
            ))}
            <NavActiveIndicator />
          </nav>
        </div>

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
