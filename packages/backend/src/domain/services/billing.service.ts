import type {
  BillingEntitlement,
  BillingTier,
  SubscriptionStatus,
} from '@the-box/types'
import { BILLING_CATALOG, getCatalogEntryByPriceId } from '../../config/billing.js'
import {
  subscriptionRepository,
  ENTITLED_STATUSES,
  type SubscriptionRow,
} from '../../infrastructure/repositories/subscription.repository.js'
import { userRepository } from '../../infrastructure/repositories/user.repository.js'
import { getStripe } from '../../infrastructure/stripe/stripe.client.js'
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
// Stripe history but has been removed from our catalog). The caller treats
// that as "no entitlement" rather than crashing.
export function tierFromPriceId(stripePriceId: string): BillingTier | null {
  return getCatalogEntryByPriceId(stripePriceId)?.tier ?? null
}

export const billingService = {
  // The entitlement read every gated endpoint hits. Returns the cheapest
  // safe default (no premium) when anything is missing or off, so a
  // misconfigured env never silently grants premium to free users.
  async getEntitlement(userId: string): Promise<BillingEntitlement> {
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
    const tier = tierFromPriceId(row.stripe_price_id)
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
  // is BILLING_CATALOG; the boolean `active` matches what stripe-check
  // would assert, so the UI only has to render strings.
  listPublicPrices(): Array<{
    tier: BillingTier
    stripePriceId: string
    unitAmount: number
    currency: string
    interval: 'month' | 'year' | null
    active: boolean
  }> {
    return BILLING_CATALOG.map((entry) => ({
      tier: entry.tier,
      stripePriceId: entry.stripePriceId,
      unitAmount: entry.unitAmount,
      currency: entry.currency,
      interval: entry.interval,
      active: !!entry.stripePriceId,
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
