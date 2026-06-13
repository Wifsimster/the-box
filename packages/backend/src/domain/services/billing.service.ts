import type {
  BillingEntitlement,
  BillingTier,
  SubscriptionStatus,
} from '@the-box/types'
import { BILLING_CATALOG } from '../../config/billing.js'
import type {
  DomainLogger,
  BillingUserRepository,
  BillingSubscriptionRepository,
} from '../ports/index.js'
import type Stripe from 'stripe'

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

// Narrow domain-facing gateway over the Stripe customer API. The composition
// root adapts the concrete Stripe SDK to this; the service file never imports
// the Stripe client, so it stays a pure domain unit.
export interface BillingStripeGateway {
  createCustomer(params: {
    email: string
    name?: string
    userId: string
  }): Promise<{ id: string }>
  // Resolves a customer to the userId stored in its metadata. `deleted`
  // mirrors Stripe's DeletedCustomer discriminator.
  retrieveCustomer(customerId: string): Promise<{ deleted: boolean; userId: string | null }>
}

// Price→tier and live-catalog resolution. Both are resolved from Stripe by
// lookup_key and cached behind the catalog resolver in infrastructure; the
// service only sees these two functions.
export interface BillingCatalogResolver {
  tierFromPriceId(stripePriceId: string): Promise<BillingTier | null>
  snapshotResolvedCatalog(): Promise<{ byLookupKey: ReadonlyMap<string, string> }>
}

export interface BillingServiceDeps {
  logger: DomainLogger
  userRepository: BillingUserRepository
  subscriptionRepository: BillingSubscriptionRepository
  // Subscription statuses that grant premium entitlement.
  entitledStatuses: ReadonlySet<SubscriptionStatus>
  stripe: BillingStripeGateway
  catalog: BillingCatalogResolver
}

export interface BillingService {
  getEntitlement(userId: string): Promise<BillingEntitlement>
  isPremium(userId: string): Promise<boolean>
  ensureStripeCustomer(args: { userId: string; email: string; name?: string }): Promise<string>
  listPublicPrices(): Promise<
    Array<{
      tier: BillingTier
      unitAmount: number
      currency: string
      interval: 'month' | 'year' | null
      active: boolean
    }>
  >
  fromStripeSubscription(sub: Stripe.Subscription): {
    stripeSubscriptionId: string
    stripePriceId: string
    status: SubscriptionStatus
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
  }
  resolveUserIdFromCustomer(customerId: string): Promise<string | null>
}

export function createBillingService(deps: BillingServiceDeps): BillingService {
  const log = deps.logger.child({ service: 'billing' })

  // The entitlement read every gated endpoint hits. Returns the cheapest
  // safe default (no premium) when anything is missing or off, so a
  // misconfigured env never silently grants premium to free users.
  //
  // Resolution order: supporter lifetime wins over recurring subscription.
  // A user who paid once for lifetime and later subscribed should still
  // surface as 'supporter' (the more durable grant) so cancellation of
  // the recurring sub doesn't drop their entitlement.
  async function getEntitlement(userId: string): Promise<BillingEntitlement> {
    const supporterAt = await deps.userRepository.getSupporterLifetimeAt(userId)
    if (supporterAt) {
      return {
        isPremium: true,
        tier: 'supporter_lifetime',
        validUntil: null,
        cancelAtPeriodEnd: false,
        source: 'supporter',
      }
    }

    const row = await deps.subscriptionRepository.findActiveByUserId(userId)
    if (!row) {
      return {
        isPremium: false,
        tier: null,
        validUntil: null,
        cancelAtPeriodEnd: false,
        source: null,
      }
    }
    const tier = await deps.catalog.tierFromPriceId(row.stripe_price_id)
    const isPremium = deps.entitledStatuses.has(row.status)
    return {
      isPremium,
      tier,
      validUntil: row.current_period_end?.toISOString() ?? null,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      source: 'subscription',
    }
  }

  return {
    getEntitlement,

    async isPremium(userId: string): Promise<boolean> {
      const entitlement = await getEntitlement(userId)
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
      const existing = await deps.userRepository.getStripeCustomerId(args.userId)
      if (existing) return existing

      const customer = await deps.stripe.createCustomer({
        email: args.email,
        name: args.name,
        userId: args.userId,
      })
      await deps.userRepository.setStripeCustomerId(args.userId, customer.id)
      log.info({ userId: args.userId, customerId: customer.id }, 'stripe customer created')
      return customer.id
    },

    // Build the catalog payload for GET /api/billing/prices. Source of truth
    // for amount/currency/interval is BILLING_CATALOG; `active` reflects
    // whether the lookup_key resolved to a live Stripe price on the latest
    // refresh, so the UI can hide a tier that hasn't been provisioned yet
    // without coupling the frontend to Stripe IDs.
    async listPublicPrices() {
      let resolved: { byLookupKey: ReadonlyMap<string, string> }
      try {
        resolved = await deps.catalog.snapshotResolvedCatalog()
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
    fromStripeSubscription(sub: Stripe.Subscription) {
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
      const row = await deps.userRepository.findByStripeCustomerId(customerId)
      if (row) return row.id

      // Fallback: customer might exist in Stripe with a userId in metadata
      // even if our DB linking row is missing (e.g. migration race). Read
      // metadata from Stripe and re-link rather than dropping the event.
      try {
        const customer = await deps.stripe.retrieveCustomer(customerId)
        if (customer.deleted) return null
        if (customer.userId) {
          await deps.userRepository.setStripeCustomerId(customer.userId, customerId)
          log.warn({ userId: customer.userId, customerId }, 'relinked stripe_customer_id from metadata')
          return customer.userId
        }
      } catch (err) {
        log.error({ err: String(err), customerId }, 'failed to retrieve customer for fallback')
      }
      return null
    },
  }
}
