import type { BillingTier } from '@the-box/types'

export const FREE_FEATURE_KEYS = [
  'dailyChallenge',
  'leaderboards',
  'achievements',
  'hintsBaseline',
] as const

export const PREMIUM_FEATURE_KEYS = [
  'catchUpFull',
  'hintsUnlimitedCatchUp',
  'advancedStats',
  'themes',
  'cosmetics',
  'earlyAccess',
  'geoMode',
] as const

export const PREMIUM_TIER_FEATURE_KEYS: Record<BillingTier, readonly string[]> = {
  premium_monthly: PREMIUM_FEATURE_KEYS,
  premium_annual: PREMIUM_FEATURE_KEYS,
  supporter_lifetime: PREMIUM_FEATURE_KEYS,
}
