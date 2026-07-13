import type { LucideIcon } from 'lucide-react'
import { Home, Play, Trophy, MapPin, Crosshair, User } from 'lucide-react'

/**
 * A destination link in the app's navigation. `path` is unlocalized — callers
 * wrap it with `useLocalizedPath()` before passing it to a router link.
 */
export interface NavLinkItem {
  /** Stable identifier, also used as a React key and `data-tour` suffix. */
  key: string
  /** i18n key for the visible label. */
  labelKey: string
  icon: LucideIcon
  /** Unlocalized route, e.g. `/play`. */
  path: string
  /**
   * Exact-match the route. Used for Home (`/`) so its NavLink isn't marked
   * active on every nested route.
   */
  end?: boolean
  /** Optional small badge shown after the label (e.g. the Geo "alpha" tag). */
  badgeKey?: string
  /** Optional `data-tour` anchor id for the onboarding tour. */
  dataTour?: string
  /**
   * Runtime feature flag (from `useFeatures()`) gating this entry. Entries
   * without a flag are always shown.
   */
  feature?: 'geoCommunity' | 'geogamers'
}

/**
 * Primary site sections — rendered in the desktop top bar and the mobile
 * navigation drawer. Premium is intentionally excluded: it is an upsell that
 * disappears for paying users, so the Header renders it conditionally.
 */
export const PRIMARY_NAV: NavLinkItem[] = [
  { key: 'home', labelKey: 'common.home', icon: Home, path: '/', end: true },
  { key: 'play', labelKey: 'common.dailyGuess', icon: Play, path: '/play' },
  {
    key: 'leaderboard',
    labelKey: 'common.leaderboard',
    icon: Trophy,
    path: '/leaderboard',
    dataTour: 'leaderboard-link',
  },
  {
    key: 'geo',
    labelKey: 'common.geo',
    icon: MapPin,
    path: '/geo',
    badgeKey: 'common.alpha',
    feature: 'geoCommunity',
  },
  {
    key: 'geogamers',
    labelKey: 'common.geogamers',
    icon: Crosshair,
    path: '/geogamers',
    badgeKey: 'common.new',
  },
]

/**
 * Thumb-reachable destinations for the mobile bottom navigation bar. Kept to
 * four items so each tap target stays generous on small phones. Labels use the
 * shorter `nav.tabs.*` strings rather than the full `common.*` titles.
 */
export const BOTTOM_NAV: NavLinkItem[] = [
  { key: 'home', labelKey: 'nav.tabs.home', icon: Home, path: '/', end: true },
  { key: 'play', labelKey: 'nav.tabs.play', icon: Play, path: '/play' },
  {
    key: 'leaderboard',
    labelKey: 'nav.tabs.leaderboard',
    icon: Trophy,
    path: '/leaderboard',
  },
  { key: 'profile', labelKey: 'nav.tabs.profile', icon: User, path: '/profile' },
]
