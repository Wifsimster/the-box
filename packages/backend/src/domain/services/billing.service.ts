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

export interface ExternalSubscriptionItem {
  price: { id: string }
  current_period_end?: number | undefined
}

export interface ExternalSubscription {
  id: string
  status: string
  cancel_at_period_end: boolean
  items: { data: ExternalSubscriptionItem[] }
}

export function toSubscriptionStatus(raw: string): SubscriptionStatus {
  return (KNOWN_STATUSES as Set<string>).has(raw)
    ? (raw as SubscriptionStatus)
    : 'incomplete'
}

export function isSubscriptionEntitled(
  row: { status: SubscriptionStatus; current_period_end: Date | null },
  unconditionalStatuses: ReadonlySet<SubscriptionStatus>,
  now: Date = new Date(),
): boolean {
  if (unconditionalStatuses.has(row.status)) return true
  if (row.status === 'past_due') {
    return row.current_period_end != null && row.current_period_end.getTime() > now.getTime()
  }
  return false
}

export interface BillingStripeGateway {
  createCustomer(params: {
    email: string
    name?: string
    userId: string
  }): Promise<{ id: string }>
  retrieveCustomer(customerId: string): Promise<{ deleted: boolean; userId: string | null }>
}

export interface BillingCatalogResolver {
  tierFromPriceId(stripePriceId: string): Promise<BillingTier | null>
  snapshotResolvedCatalog(): Promise<{ byLookupKey: ReadonlyMap<string, string> }>
}

export interface BillingServiceDeps {
  logger: DomainLogger
  userRepository: BillingUserRepository
  subscriptionRepository: BillingSubscriptionRepository
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
  fromStripeSubscription(sub: ExternalSubscription): {
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
    const isPremium = isSubscriptionEntitled(row, deps.entitledStatuses)
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

    async listPublicPrices() {
      let resolved: { byLookupKey: ReadonlyMap<string, string> }
      try {
        resolved = await deps.catalog.snapshotResolvedCatalog()
      } catch (err) {
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

    fromStripeSubscription(sub: ExternalSubscription) {
      const item = sub.items.data[0]
      if (!item) {
        throw new Error(`stripe subscription ${sub.id} has no items`)
      }
      if (sub.items.data.length > 1) {
        log.warn(
          {
            subscriptionId: sub.id,
            itemCount: sub.items.data.length,
            priceIds: sub.items.data.map((i) => i.price.id),
          },
          'subscription has multiple items; using first',
        )
      }
      const periodEnd = item.current_period_end
      return {
        stripeSubscriptionId: sub.id,
        stripePriceId: item.price.id,
        status: toSubscriptionStatus(sub.status),
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      }
    },

    async resolveUserIdFromCustomer(customerId: string): Promise<string | null> {
      const row = await deps.userRepository.findByStripeCustomerId(customerId)
      if (row) return row.id

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
