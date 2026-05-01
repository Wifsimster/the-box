import type { BillingTier } from '@the-box/types'

// Source of truth for what a tier should look like in Stripe. Each entry
// declares a `lookupKey`; the resolver in
// infrastructure/stripe/billing-catalog.resolver.ts turns that into a
// concrete priceId at runtime via `stripe.prices.list({ lookup_keys })`.
//
// The same code path therefore works in test and live mode (different
// price IDs, same lookup_keys), and replacing a price (e.g. changing the
// amount) is a Stripe-side operation: create the new price with the same
// lookup_key + transfer_lookup_key=true, no env or deploy needed.
//
// `npm run stripe:check` resolves each entry by lookup_key and asserts
// amount/currency/interval match these declarations, so a mis-priced
// product fails CI before reaching prod.
export interface BillingCatalogEntry {
  tier: BillingTier
  lookupKey: string
  unitAmount: number // cents (EUR)
  currency: 'eur'
  interval: 'month' | 'year' | null // null = one-time
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
] as const

export function getCatalogEntry(tier: BillingTier): BillingCatalogEntry | undefined {
  return BILLING_CATALOG.find((entry) => entry.tier === tier)
}
