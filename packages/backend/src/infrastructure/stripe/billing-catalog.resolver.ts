import type { BillingTier } from '@the-box/types'
import { BILLING_CATALOG } from '../../config/billing.js'
import { logger } from '../logger/logger.js'
import { getStripe } from './stripe.client.js'

const log = logger.child({ module: 'billing-catalog-resolver' })

const TTL_MS = 60 * 60 * 1000

interface ResolvedCatalog {
  fetchedAt: number
  byLookupKey: Map<string, string>
  byPriceId: Map<string, BillingTier>
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

export async function resolvePriceId(tier: BillingTier): Promise<string | null> {
  const entry = BILLING_CATALOG.find((e) => e.tier === tier)
  if (!entry) return null
  const resolved = await ensureFresh()
  return resolved.byLookupKey.get(entry.lookupKey) ?? null
}

export async function tierFromPriceId(priceId: string): Promise<BillingTier | null> {
  const resolved = await ensureFresh()
  if (resolved.byPriceId.has(priceId)) return resolved.byPriceId.get(priceId) ?? null
  cache = null
  const next = await ensureFresh()
  return next.byPriceId.get(priceId) ?? null
}

export async function snapshotResolvedCatalog(): Promise<{
  byLookupKey: ReadonlyMap<string, string>
  byPriceId: ReadonlyMap<string, BillingTier>
}> {
  const resolved = await ensureFresh()
  return { byLookupKey: resolved.byLookupKey, byPriceId: resolved.byPriceId }
}

export function invalidateCatalogCache(): void {
  cache = null
}
