import type { BillingTier } from '@the-box/types'

export interface BillingCatalogEntry {
  tier: BillingTier
  lookupKey: string
  unitAmount: number
  currency: 'eur'
  interval: 'month' | 'year' | null
}

export const BILLING_CATALOG: readonly BillingCatalogEntry[] = [
  {
    tier: 'premium_monthly',
    lookupKey: 'the_box_premium_monthly',
    unitAmount: 399,
    currency: 'eur',
    interval: 'month',
  },
  {
    tier: 'premium_annual',
    lookupKey: 'the_box_premium_annual',
    unitAmount: 2999,
    currency: 'eur',
    interval: 'year',
  },
  {
    tier: 'supporter_lifetime',
    lookupKey: 'the_box_supporter_lifetime',
    unitAmount: 7999,
    currency: 'eur',
    interval: null,
  },
] as const

export function getCatalogEntry(tier: BillingTier): BillingCatalogEntry | undefined {
  return BILLING_CATALOG.find((entry) => entry.tier === tier)
}
