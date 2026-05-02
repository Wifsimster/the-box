import type {
  BillingEntitlement,
  BillingTier,
  SubscriptionStatus,
} from '@the-box/types'
import { BILLING_CATALOG } from '../../config/billing.js'
import {
  subscriptionRepository,
  ENTITLED_STATUSES,
  type SubscriptionRow,
} from '../../infrastructure/repositories/subscription.repository.js'
import { userRepository } from '../../infrastructure/repositories/user.repository.js'
import { getStripe } from '../../infrastructure/stripe/stripe.client.js'
import {
  snapshotResolvedCatalog,
  tierFromPriceId as resolveTierFromPriceId,
} from '../../infrastructure/stripe/billing-catalog.resolver.js'
import { repoLogger } from '../../infrastructure/logger/logger.js'
import type Stripe from 'stripe'

const log = repoLogger.child({ service: 'billing' })

// Stripe Subscription.status values map 1:1 to our SubscriptionStatus union;
// this guard keeps the type system honest when reading from the SDK.
const KNOWN_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
])

export function toSubscriptionStatus(raw: string): SubscriptionStatus {
  return (KNOWN_STATUSES as Set<string>).has(raw)
    ? (raw as SubscriptionStatus)
    : 'incomplete'
}

// Lookup the BillingTier for a Stripe price ID. Returns null if the price
// isn't one we recognize (e.g. an old/archived price that survived in
// Stripe history but has been rotated out of the active set). The caller
// treats that as "no entitlement" rather than crashing. Async because the
// price→tier map is resolved from Stripe by lookup_key on first use and
// cached with a TTL refresh — see billing-catalog.resolver.
export async function tierFromPriceId(stripePriceId: string): Promise<BillingTier | null> {
  return resolveTierFromPriceId(stripePriceId)
}

export const billingService = {
  // The entitlement read every gated endpoint hits. Returns the cheapest
  // safe default (no premium) when anything is missing or off, so a
  // misconfigured env never silently grants premium to free users.
  //
  // Resolution order: supporter lifetime wins over recurring subscription.
  // A user who paid once for lifetime and later subscribed should still
  // surface as 'supporter' (the more durable grant) so cancellation of
  // the recurring sub doesn't drop their entitlement.
  async getEntitlement(userId: string): Promise<BillingEntitlement> {
    const supporterAt = await userRepository.getSupporterLifetimeAt(userId)
    if (supporterAt) {
      return {
        isPremium: true,
        tier: 'supporter_lifetime',
        validUntil: null,
        cancelAtPeriodEnd: false,
        source: 'supporter',
      }
    }

    const row = await subscriptionRepository.findActiveByUserId(userId)
    if (!row) {
      return {
        isPremium: false,
        tier: null,
        validUntil: null,
        cancelAtPeriodEnd: false,
        source: null,
      }
    }
    const tier = await tierFromPriceId(row.stripe_price_id)
    const isPremium = ENTITLED_STATUSES.has(row.status)
    return {
      isPremium,
      tier,
      validUntil: row.current_period_end?.toISOString() ?? null,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      source: 'subscription',
    }
  },

  async isPremium(userId: string): Promise<boolean> {
    const entitlement = await this.getEntitlement(userId)
    return entitlement.isPremium
  },

  // Lazy customer creation. Free users never get a Stripe Customer; the
  // first time they hit checkout we create one with metadata.userId so
  // webhooks can resolve back even if our DB row is missing.
  async ensureStripeCustomer(args: {
    userId: string
    email: string
    name?: string
  }): Promise<string> {
    const existing = await userRepository.getStripeCustomerId(args.userId)
    if (existing) return existing

    const stripe = getStripe()
    const customer = await stripe.customers.create({
      email: args.email,
      name: args.name,
      metadata: { userId: args.userId },
    })
    await userRepository.setStripeCustomerId(args.userId, customer.id)
    log.info({ userId: args.userId, customerId: customer.id }, 'stripe customer created')
    return customer.id
  },

  // Build the catalog payload for GET /api/billing/prices. Source of truth
  // for amount/currency/interval is BILLING_CATALOG; `active` reflects
  // whether the lookup_key resolved to a live Stripe price on the latest
  // refresh, so the UI can hide a tier that hasn't been provisioned yet
  // without coupling the frontend to Stripe IDs.
  async listPublicPrices(): Promise<Array<{
    tier: BillingTier
    unitAmount: number
    currency: string
    interval: 'month' | 'year' | null
    active: boolean
  }>> {
    let resolved: { byLookupKey: ReadonlyMap<string, string> }
    try {
      resolved = await snapshotResolvedCatalog()
    } catch (err) {
      // Stripe outage: surface every tier as inactive so the marketing
      // page degrades gracefully rather than 500-ing.
      log.warn({ err: String(err) }, 'failed to resolve catalog, returning all-inactive')
      resolved = { byLookupKey: new Map() }
    }
    return BILLING_CATALOG.map((entry) => ({
      tier: entry.tier,
      unitAmount: entry.unitAmount,
      currency: entry.currency,
      interval: entry.interval,
      active: resolved.byLookupKey.has(entry.lookupKey),
    }))
  },

  // Pull the relevant fields out of a Stripe subscription so the repo can
  // upsert without leaking SDK types into the data layer. Period end on a
  // canceled subscription is the cancellation timestamp, which we keep
  // around so the UI can show "premium ended on …".
  fromStripeSubscription(sub: Stripe.Subscription): {
    stripeSubscriptionId: string
    stripePriceId: string
    status: SubscriptionStatus
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
  } {
    const item = sub.items.data[0]
    if (!item) {
      throw new Error(`stripe subscription ${sub.id} has no items`)
    }
    if (sub.items.data.length > 1) {
      // We only sell single-line subscriptions today; if Stripe ever sends
      // a multi-item subscription here it's either a config mistake or a
      // future feature we forgot to teach this code. Logging the IDs makes
      // it findable in prod without changing behavior.
      log.warn(
        {
          subscriptionId: sub.id,
          itemCount: sub.items.data.length,
          priceIds: sub.items.data.map((i) => i.price.id),
        },
        'subscription has multiple items; using first',
      )
    }
    const periodEnd = (item as Stripe.SubscriptionItem & { current_period_end?: number })
      .current_period_end
    return {
      stripeSubscriptionId: sub.id,
      stripePriceId: item.price.id,
      status: toSubscriptionStatus(sub.status),
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    }
  },

  // Resolve a Stripe customer ID to our internal user. Webhooks key on
  // customer.id (not user.id), so this is the bridge.
  async resolveUserIdFromCustomer(customerId: string): Promise<string | null> {
    const row = await userRepository.findByStripeCustomerId(customerId)
    if (row) return row.id

    // Fallback: customer might exist in Stripe with a userId in metadata
    // even if our DB linking row is missing (e.g. migration race). Read
    // metadata from Stripe and re-link rather than dropping the event.
    try {
      const stripe = getStripe()
      const customer = await stripe.customers.retrieve(customerId)
      if (customer.deleted) return null
      const userId = customer.metadata?.['userId']
      if (userId) {
        await userRepository.setStripeCustomerId(userId, customerId)
        log.warn({ userId, customerId }, 'relinked stripe_customer_id from metadata')
        return userId
      }
    } catch (err) {
      log.error({ err: String(err), customerId }, 'failed to retrieve customer for fallback')
    }
    return null
  },

  rowToSubscription: (row: SubscriptionRow) => row,
}
