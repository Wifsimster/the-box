import type { BillingTier } from '@the-box/types'
import { BILLING_CATALOG } from '../../config/billing.js'
import { logger } from '../logger/logger.js'
import { getStripe } from './stripe.client.js'

const log = logger.child({ module: 'billing-catalog-resolver' })

const TTL_MS = 60 * 60 * 1000 // 1h — price changes are rare, and a Stripe
                              // outage shouldn't take billing pages down

interface ResolvedCatalog {
  fetchedAt: number
  byLookupKey: Map<string, string> // lookup_key → price.id
  byPriceId: Map<string, BillingTier> // price.id → tier (reverse for webhooks)
}

let cache: ResolvedCatalog | null = null
let inflight: Promise<ResolvedCatalog> | null = null

async function refresh(): Promise<ResolvedCatalog> {
  const stripe = getStripe()
  const lookupKeys = BILLING_CATALOG.map((entry) => entry.lookupKey)
  const { data } = await stripe.prices.list({
    lookup_keys: lookupKeys,
    active: true,
    limit: 100,
  })

  const byLookupKey = new Map<string, string>()
  const byPriceId = new Map<string, BillingTier>()

  for (const entry of BILLING_CATALOG) {
    const matches = data.filter((price) => price.lookup_key === entry.lookupKey)
    if (matches.length === 0) {
      log.warn(
        { tier: entry.tier, lookupKey: entry.lookupKey },
        'no active stripe price found for lookup_key',
      )
      continue
    }
    if (matches.length > 1) {
      // Stripe allows lookup_key to be reused across prices when the prior
      // owner is archived; refusing here forces a human to clean it up
      // rather than silently picking the wrong one.
      throw new Error(
        `stripe returned ${matches.length} active prices for lookup_key "${entry.lookupKey}"; archive the duplicates`,
      )
    }
    const price = matches[0]!
    byLookupKey.set(entry.lookupKey, price.id)
    byPriceId.set(price.id, entry.tier)
  }

  cache = { fetchedAt: Date.now(), byLookupKey, byPriceId }
  log.debug({ resolved: cache.byLookupKey.size }, 'billing catalog resolved')
  return cache
}

async function ensureFresh(): Promise<ResolvedCatalog> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache
  if (inflight) return inflight
  inflight = refresh().finally(() => {
    inflight = null
  })
  return inflight
}

// Returns the live Stripe price.id for a tier, or null if the lookup_key
// hasn't been provisioned yet (e.g. fresh test sandbox). Callers should
// surface a 500/PRICE_NOT_CONFIGURED rather than charge a fallback.
export async function resolvePriceId(tier: BillingTier): Promise<string | null> {
  const entry = BILLING_CATALOG.find((e) => e.tier === tier)
  if (!entry) return null
  const resolved = await ensureFresh()
  return resolved.byLookupKey.get(entry.lookupKey) ?? null
}

// Reverse lookup used by webhooks: an inbound subscription event carries a
// price.id and we need to know which tier it belongs to. Returns null for
// archived/historical prices that have rotated out of the active set —
// callers treat that as "no entitlement" rather than crashing.
export async function tierFromPriceId(priceId: string): Promise<BillingTier | null> {
  const resolved = await ensureFresh()
  if (resolved.byPriceId.has(priceId)) return resolved.byPriceId.get(priceId) ?? null
  // The cached snapshot may be stale if a price was just rotated; force one
  // refresh before giving up so a freshly-issued price doesn't 404 webhooks
  // for the cache TTL window.
  cache = null
  const next = await ensureFresh()
  return next.byPriceId.get(priceId) ?? null
}

// Read-only snapshot of the current resolution. Used by listPublicPrices to
// surface the resolved priceId without forcing every caller to re-await.
export async function snapshotResolvedCatalog(): Promise<{
  byLookupKey: ReadonlyMap<string, string>
  byPriceId: ReadonlyMap<string, BillingTier>
}> {
  const resolved = await ensureFresh()
  return { byLookupKey: resolved.byLookupKey, byPriceId: resolved.byPriceId }
}

// Test/admin escape hatch — drop the cache so the next call re-queries
// Stripe immediately. Not exported via barrels; only intended for tests
// and the stripe-check script.
export function invalidateCatalogCache(): void {
  cache = null
}
