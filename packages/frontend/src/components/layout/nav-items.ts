import type { LucideIcon } from 'lucide-react'
import { CalendarCheck, Trophy, MapPin, Crosshair, User, BookOpen, Info } from 'lucide-react'
import type { FeatureGated } from '@/lib/dailyFirst'

/**
 * A destination link in the app's navigation. `path` is unlocalized — callers
 * wrap it with `useLocalizedPath()` before passing it to a router link.
 */
export interface NavLinkItem extends FeatureGated {
  /** Stable identifier, also used as a React key. */
  key: string
  /** i18n key for the visible label. */
  labelKey: string
  icon: LucideIcon
  /** Unlocalized route, e.g. `/play`. */
  path: string
  /**
   * Exact-match the route. Used for Today (`/`) so its NavLink isn't marked
   * active on every nested route.
   */
  end?: boolean
  /** Optional small badge shown after the label (e.g. the Geo "alpha" tag). */
  badgeKey?: string
  // `feature` (from FeatureGated): runtime flag from `useFeatures()` gating
  // this entry. Entries without a flag are always shown.
}

/**
 * Primary site sections — rendered in the desktop top bar. Daily-first IA:
 * the only destinations a daily player needs are today's box and the
 * results/ranking. Everything else is a secondary entry (SECONDARY_NAV).
 * Premium is intentionally excluded: it is an upsell that disappears for
 * paying users, so it lives in the account menu and the post-game loop.
 */
export const PRIMARY_NAV: NavLinkItem[] = [
  { key: 'today', labelKey: 'common.today', icon: CalendarCheck, path: '/', end: true },
  {
    key: 'results',
    labelKey: 'common.results',
    icon: Trophy,
    path: '/leaderboard',
  },
]

/**
 * Secondary entries — the mobile drawer and the footer. Other game modes and
 * the former landing page stay reachable, but never compete with today's box.
 */
export const SECONDARY_NAV: NavLinkItem[] = [
  {
    key: 'geogamers',
    labelKey: 'common.geogamers',
    icon: Crosshair,
    path: '/panorama',
    badgeKey: 'common.new',
    // D5: the NOUVEAU entry only shows where GEOGAMERS_ENABLED is on.
    feature: 'geogamers',
  },
  {
    key: 'geo',
    labelKey: 'common.geo',
    icon: MapPin,
    path: '/geo',
    badgeKey: 'common.alpha',
    feature: 'geoCommunity',
  },
  { key: 'rules', labelKey: 'common.rules', icon: BookOpen, path: '/rules' },
  { key: 'about', labelKey: 'common.about', icon: Info, path: '/about' },
]

/**
 * Thumb-reachable destinations for the mobile bottom navigation bar: three
 * tabs, one per daily question — "today's box", "how did I do", "me".
 */
export const BOTTOM_NAV: NavLinkItem[] = [
  { key: 'today', labelKey: 'nav.tabs.today', icon: CalendarCheck, path: '/', end: true },
  {
    key: 'results',
    labelKey: 'nav.tabs.results',
    icon: Trophy,
    path: '/leaderboard',
  },
  { key: 'profile', labelKey: 'nav.tabs.profile', icon: User, path: '/profile' },
]
