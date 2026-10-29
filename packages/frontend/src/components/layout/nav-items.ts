import type { LucideIcon } from 'lucide-react'
import { CalendarCheck, Trophy, MapPin, Crosshair, User, BookOpen, Info } from 'lucide-react'
import type { FeatureGated } from '@/lib/dailyFirst'

export interface NavLinkItem extends FeatureGated {
  key: string
  labelKey: string
  icon: LucideIcon
  path: string
  end?: boolean
  badgeKey?: string
}

export const PRIMARY_NAV: NavLinkItem[] = [
  { key: 'today', labelKey: 'common.today', icon: CalendarCheck, path: '/', end: true },
  {
    key: 'results',
    labelKey: 'common.results',
    icon: Trophy,
    path: '/leaderboard',
  },
]

export const SECONDARY_NAV: NavLinkItem[] = [
  {
    key: 'geogamers',
    labelKey: 'common.geogamers',
    icon: Crosshair,
    path: '/panorama',
    badgeKey: 'common.new',
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
