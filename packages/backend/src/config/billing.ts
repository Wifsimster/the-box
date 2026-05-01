import type { BillingTier } from '@the-box/types'
import { env } from './env.js'

// Source of truth for what a tier should look like in Stripe. The
// `npm run stripe:check` script retrieves each `stripePriceId` from
// Stripe and asserts amount/currency/interval match these declarations,
// so a renamed price in the dashboard fails CI before reaching prod.
export interface BillingCatalogEntry {
  tier: BillingTier
  stripePriceId: string
  unitAmount: number // cents (EUR)
  currency: 'eur'
  interval: 'month' | 'year' | null // null = one-time
}

export const BILLING_CATALOG: readonly BillingCatalogEntry[] = [
  {
    tier: 'premium_monthly',
    stripePriceId: env.STRIPE_PRICE_PREMIUM_MONTHLY,
    unitAmount: 399,
    currency: 'eur',
    interval: 'month',
  },
  {
    tier: 'premium_annual',
    stripePriceId: env.STRIPE_PRICE_PREMIUM_ANNUAL,
    unitAmount: 2999,
    currency: 'eur',
    interval: 'year',
  },
] as const

export function getCatalogEntry(tier: BillingTier): BillingCatalogEntry | undefined {
  return BILLING_CATALOG.find((entry) => entry.tier === tier)
}

export function getCatalogEntryByPriceId(priceId: string): BillingCatalogEntry | undefined {
  return BILLING_CATALOG.find((entry) => entry.stripePriceId === priceId)
}
