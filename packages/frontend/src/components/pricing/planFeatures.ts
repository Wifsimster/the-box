import type { BillingTier } from '@the-box/types'

/**
 * Per-card "what's included" lists, expressed as i18n item keys under
 * `pricing.features.items.*` so the copy stays in sync with the comparison
 * `FeatureMatrix` instead of being duplicated.
 *
 * The Free card lists only what free players actually get; every paid tier
 * shares the same premium highlights (the differences between paid tiers are
 * price/cadence, not features), shown under an "everything in Free, plus:" lead.
 */
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
