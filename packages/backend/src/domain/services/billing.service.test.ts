import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { SubscriptionStatus } from '@the-box/types'
import type { DomainLogger } from '../ports/logger.js'
import {
  createBillingService,
  isSubscriptionEntitled,
  type BillingServiceDeps,
} from './billing.service.js'

const UNCONDITIONAL: ReadonlySet<SubscriptionStatus> = new Set(['active', 'trialing'])
const IN_ONE_HOUR = new Date(Date.now() + 60 * 60 * 1000)
const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000)

describe('isSubscriptionEntitled', () => {
  it('grants active and trialing unconditionally, regardless of period end', () => {
    assert.equal(isSubscriptionEntitled({ status: 'active', current_period_end: null }, UNCONDITIONAL), true)
    assert.equal(isSubscriptionEntitled({ status: 'trialing', current_period_end: ONE_HOUR_AGO }, UNCONDITIONAL), true)
  })

  it('grants past_due only while the paid period is still running (grace window)', () => {
    assert.equal(
      isSubscriptionEntitled({ status: 'past_due', current_period_end: IN_ONE_HOUR }, UNCONDITIONAL),
      true,
      'past_due within period keeps premium so a transient failure does not revoke mid-cycle',
    )
    assert.equal(
      isSubscriptionEntitled({ status: 'past_due', current_period_end: ONE_HOUR_AGO }, UNCONDITIONAL),
      false,
      'past_due after the paid period expired is no longer entitled',
    )
    assert.equal(
      isSubscriptionEntitled({ status: 'past_due', current_period_end: null }, UNCONDITIONAL),
      false,
      'past_due with no known period end is not entitled',
    )
  })

  it('never grants canceled / unpaid / incomplete', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'] as SubscriptionStatus[]) {
      assert.equal(
        isSubscriptionEntitled({ status, current_period_end: IN_ONE_HOUR }, UNCONDITIONAL),
        false,
        `${status} must be free`,
      )
    }
  })
})

// ---- getEntitlement end-to-end (with fakes) ----------------------------

const noopLogger = {
  child: () => noopLogger,
  info() {},
  warn() {},
  error() {},
  debug() {},
} as unknown as DomainLogger

function makeService(row: {
  status: SubscriptionStatus
  current_period_end: Date | null
} | null): ReturnType<typeof createBillingService> {
  const deps: BillingServiceDeps = {
    logger: noopLogger,
    entitledStatuses: UNCONDITIONAL,
    userRepository: {
      getSupporterLifetimeAt: async () => null,
      getStripeCustomerId: async () => null,
      setStripeCustomerId: async () => {},
      findByStripeCustomerId: async () => null,
    },
    subscriptionRepository: {
      findActiveByUserId: async () =>
        row
          ? {
              stripe_price_id: 'price_test',
              status: row.status,
              current_period_end: row.current_period_end,
              cancel_at_period_end: false,
            }
          : null,
    },
    stripe: {
      createCustomer: async () => ({ id: 'cus_test' }),
      retrieveCustomer: async () => ({ deleted: false, userId: null }),
    },
    catalog: {
      tierFromPriceId: async () => 'premium_monthly',
      snapshotResolvedCatalog: async () => ({ byLookupKey: new Map() }),
    },
  }
  return createBillingService(deps)
}

describe('billingService.getEntitlement — grace window', () => {
  it('keeps premium for a past_due subscription still inside its paid period', async () => {
    const svc = makeService({ status: 'past_due', current_period_end: IN_ONE_HOUR })
    const entitlement = await svc.getEntitlement('u1')
    assert.equal(entitlement.isPremium, true)
    assert.equal(entitlement.source, 'subscription')
    assert.equal(entitlement.tier, 'premium_monthly')
  })

  it('drops premium once a past_due subscription is past its paid period', async () => {
    const svc = makeService({ status: 'past_due', current_period_end: ONE_HOUR_AGO })
    const entitlement = await svc.getEntitlement('u1')
    assert.equal(entitlement.isPremium, false)
  })

  it('grants premium for a normal active subscription', async () => {
    const svc = makeService({ status: 'active', current_period_end: IN_ONE_HOUR })
    const entitlement = await svc.getEntitlement('u1')
    assert.equal(entitlement.isPremium, true)
  })

  it('returns free when there is no subscription row', async () => {
    const svc = makeService(null)
    const entitlement = await svc.getEntitlement('u1')
    assert.equal(entitlement.isPremium, false)
    assert.equal(entitlement.source, null)
  })
})
