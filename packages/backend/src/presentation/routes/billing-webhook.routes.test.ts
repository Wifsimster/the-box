import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import Stripe from 'stripe'
import {
  createBillingWebhookRouter,
  parseWebhookSecrets,
  type BillingWebhookDeps,
  type BillingWebhookEventLogRepo,
  type BillingWebhookUserRepo,
  type BillingWebhookSubscriptionRepo,
  type BillingWebhookBillingService,
} from './billing-webhook.routes.js'
import type { DomainLogger } from '../../domain/ports/logger.js'
import type { UpsertSubscriptionInput } from '../../infrastructure/repositories/subscription.repository.js'

// ---- Test scaffolding --------------------------------------------------

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
}

// The Stripe SDK only needs a key to construct; webhook signature
// verification is pure HMAC and never hits the network.
const stripe = new Stripe('sk_test_dummy_for_signature_verification_only')

const TEST_SECRET = 'whsec_test_secret_for_unit_tests_0123456789abcdef'

interface FakeState {
  claimEventCalls: Array<{ eventId: string; type: string }>
  claimEventResult: { alreadyProcessed: boolean }
  markProcessedCalls: string[]
  grantSupporterCalls: string[]
  revokeSupporterCalls: Array<{ userId: string; reason: string }>
  clearStripeCustomerCalls: string[]
  upsertCalls: UpsertSubscriptionInput[]
  resolveUserCalls: string[]
  resolveUserResult: string | null
  // Optional throw injection points
  dispatchShouldThrow: boolean
}

interface Fakes {
  deps: BillingWebhookDeps
  state: FakeState
}

function makeFakes(overrides: Partial<FakeState> = {}): Fakes {
  const state: FakeState = {
    claimEventCalls: [],
    claimEventResult: { alreadyProcessed: false },
    markProcessedCalls: [],
    grantSupporterCalls: [],
    revokeSupporterCalls: [],
    clearStripeCustomerCalls: [],
    upsertCalls: [],
    resolveUserCalls: [],
    resolveUserResult: 'user-resolved-from-customer',
    dispatchShouldThrow: false,
    ...overrides,
  }

  const eventLogRepo: BillingWebhookEventLogRepo = {
    async claimEvent(eventId, type) {
      state.claimEventCalls.push({ eventId, type })
      return state.claimEventResult
    },
    async markEventProcessed(eventId) {
      state.markProcessedCalls.push(eventId)
    },
  }

  const userRepo: BillingWebhookUserRepo = {
    async grantSupporterLifetime(userId) {
      state.grantSupporterCalls.push(userId)
      if (state.dispatchShouldThrow) throw new Error('synthetic dispatch failure')
      return true
    },
    async revokeSupporterLifetime(userId, reason) {
      state.revokeSupporterCalls.push({ userId, reason })
      return true
    },
    async clearStripeCustomerId(userId) {
      state.clearStripeCustomerCalls.push(userId)
    },
  }

  const subscriptionRepo: BillingWebhookSubscriptionRepo = {
    async upsert(input) {
      state.upsertCalls.push(input)
      return undefined
    },
  }

  const billingSvc: BillingWebhookBillingService = {
    async resolveUserIdFromCustomer(customerId) {
      state.resolveUserCalls.push(customerId)
      return state.resolveUserResult
    },
    fromStripeSubscription(sub) {
      const item = sub.items.data[0]
      if (!item) throw new Error('no items')
      return {
        stripeSubscriptionId: sub.id,
        stripePriceId: item.price.id,
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }
    },
  }

  const deps: BillingWebhookDeps = {
    stripeEventLogRepository: eventLogRepo,
    userRepository: userRepo,
    subscriptionRepository: subscriptionRepo,
    billingService: billingSvc,
    getStripe: () => stripe,
    getSecrets: () => [TEST_SECRET],
    logger: silentLogger,
  }

  return { deps, state }
}

interface RunningServer {
  url: string
  close(): Promise<void>
}

async function serveRouter(deps: BillingWebhookDeps): Promise<RunningServer> {
  const app = express()
  // Mount the webhook router BEFORE express.json(), exactly like prod.
  app.use('/api/billing/webhook', createBillingWebhookRouter(deps))
  app.use(express.json())

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const addr = server.address() as AddressInfo
  const url = `http://127.0.0.1:${addr.port}/api/billing/webhook`

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}

interface StripeEventLite {
  id: string
  type: string
  data: { object: unknown }
  // Stripe events have many more fields; the SDK only checks signature
  // against the raw body, so a minimal shape is enough for these tests.
  api_version?: string
  created?: number
  livemode?: boolean
  object?: 'event'
  pending_webhooks?: number
  request?: { id: string | null; idempotency_key: string | null } | null
}

function buildEvent(input: {
  id?: string
  type: string
  data: unknown
  created?: number
}): StripeEventLite {
  return {
    id: input.id ?? `evt_${Math.random().toString(36).slice(2, 12)}`,
    type: input.type,
    data: { object: input.data },
    api_version: '2024-06-20',
    created: input.created ?? Math.floor(Date.now() / 1000),
    livemode: false,
    object: 'event',
    pending_webhooks: 1,
    request: null,
  }
}

interface SignedPostOptions {
  secret?: string
  signingSecret?: string
  timestamp?: number
  signature?: string // override entirely (for negative tests)
  omitSignature?: boolean
}

async function signedPost(
  url: string,
  event: StripeEventLite,
  options: SignedPostOptions = {},
): Promise<Response> {
  const payload = JSON.stringify(event)
  const signingSecret = options.signingSecret ?? options.secret ?? TEST_SECRET
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (!options.omitSignature) {
    headers['stripe-signature'] =
      options.signature ??
      stripe.webhooks.generateTestHeaderString({
        payload,
        secret: signingSecret,
        timestamp,
      })
  }
  return fetch(url, { method: 'POST', headers, body: payload })
}

// ---- Tests -------------------------------------------------------------

describe('parseWebhookSecrets', () => {
  it('splits comma-separated secrets and trims whitespace', () => {
    assert.deepEqual(parseWebhookSecrets('a,b, c , d'), ['a', 'b', 'c', 'd'])
  })
  it('drops empty entries', () => {
    assert.deepEqual(parseWebhookSecrets(' , a , , b , '), ['a', 'b'])
  })
  it('returns [] for empty input', () => {
    assert.deepEqual(parseWebhookSecrets(''), [])
  })
})

describe('billing-webhook router — signature verification', () => {
  let server: RunningServer
  let fakes: Fakes

  before(async () => {
    fakes = makeFakes()
    server = await serveRouter(fakes.deps)
  })
  after(async () => {
    await server.close()
  })

  it('rejects request with no stripe-signature header (400)', async () => {
    const event = buildEvent({ type: 'checkout.session.completed', data: {} })
    const res = await signedPost(server.url, event, { omitSignature: true })
    assert.equal(res.status, 400)
    const body = await res.text()
    assert.match(body, /missing stripe-signature/)
    assert.equal(fakes.state.claimEventCalls.length, 0, 'must not claim event when sig missing')
  })

  it('rejects request with malformed signature (400)', async () => {
    const event = buildEvent({ type: 'checkout.session.completed', data: {} })
    const res = await signedPost(server.url, event, { signature: 't=1,v1=deadbeef' })
    assert.equal(res.status, 400)
    const body = await res.text()
    assert.match(body, /signature verification failed/)
    assert.equal(fakes.state.claimEventCalls.length, 0, 'must not claim event on bad sig')
  })

  it('rejects request signed with the wrong secret (400)', async () => {
    const event = buildEvent({ type: 'checkout.session.completed', data: {} })
    const res = await signedPost(server.url, event, { signingSecret: 'whsec_wrong_secret' })
    assert.equal(res.status, 400)
    assert.equal(fakes.state.claimEventCalls.length, 0)
  })

  it('rejects request with timestamp outside default 300s tolerance (400)', async () => {
    const event = buildEvent({ type: 'checkout.session.completed', data: {} })
    // 10 minutes in the past — Stripe SDK default tolerance is 300s.
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600
    const res = await signedPost(server.url, event, { timestamp: tenMinutesAgo })
    assert.equal(res.status, 400)
    assert.equal(fakes.state.claimEventCalls.length, 0, 'must not claim event on stale timestamp')
  })
})

describe('billing-webhook router — secret rotation', () => {
  it('accepts an event signed by any of the configured secrets', async () => {
    const fakes = makeFakes()
    fakes.deps.getSecrets = () => ['whsec_old_rotated_out', TEST_SECRET]
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        id: 'evt_rotation_1',
        type: 'checkout.session.completed',
        data: { mode: 'subscription' }, // ignored by dispatch (not supporter)
      })
      const res = await signedPost(server.url, event, { signingSecret: TEST_SECRET })
      assert.equal(res.status, 200)
      assert.equal(fakes.state.claimEventCalls.length, 1)
    } finally {
      await server.close()
    }
  })

  it('returns 503 when no webhook secrets are configured', async () => {
    const fakes = makeFakes()
    fakes.deps.getSecrets = () => []
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({ type: 'checkout.session.completed', data: {} })
      // Even a malformed signature suffices — the secret check happens first.
      const res = await signedPost(server.url, event, { signature: 't=1,v1=x' })
      assert.equal(res.status, 503)
      const body = await res.text()
      assert.match(body, /webhook not configured/)
      assert.equal(fakes.state.claimEventCalls.length, 0)
    } finally {
      await server.close()
    }
  })
})

describe('billing-webhook router — idempotency', () => {
  it('grants supporter lifetime once on a valid checkout.session.completed', async () => {
    const fakes = makeFakes()
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        id: 'evt_supporter_1',
        type: 'checkout.session.completed',
        data: {
          id: 'cs_test_1',
          mode: 'payment',
          metadata: { tier: 'supporter_lifetime', userId: 'user-42' },
        },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 200)
      const body = await res.json() as { received: boolean; duplicate?: boolean }
      assert.equal(body.received, true)
      assert.equal(body.duplicate, undefined)
      assert.deepEqual(fakes.state.grantSupporterCalls, ['user-42'])
      assert.deepEqual(fakes.state.markProcessedCalls, ['evt_supporter_1'])
    } finally {
      await server.close()
    }
  })

  it('short-circuits on replay (alreadyProcessed=true) without re-running side effects', async () => {
    const fakes = makeFakes({ claimEventResult: { alreadyProcessed: true } })
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        id: 'evt_replay_1',
        type: 'checkout.session.completed',
        data: {
          id: 'cs_test_replay',
          mode: 'payment',
          metadata: { tier: 'supporter_lifetime', userId: 'user-99' },
        },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 200)
      const body = await res.json() as { received: boolean; duplicate?: boolean }
      assert.equal(body.received, true)
      assert.equal(body.duplicate, true)
      assert.equal(fakes.state.grantSupporterCalls.length, 0, 'must not re-grant on duplicate')
      assert.equal(fakes.state.markProcessedCalls.length, 0, 'must not re-mark on duplicate')
    } finally {
      await server.close()
    }
  })

  it('returns 500 and does NOT mark processed when dispatch throws (so Stripe retries)', async () => {
    const fakes = makeFakes({ dispatchShouldThrow: true })
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        id: 'evt_throws_1',
        type: 'checkout.session.completed',
        data: {
          id: 'cs_test_throws',
          mode: 'payment',
          metadata: { tier: 'supporter_lifetime', userId: 'user-throws' },
        },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 500)
      assert.equal(fakes.state.claimEventCalls.length, 1, 'event was claimed')
      assert.equal(fakes.state.grantSupporterCalls.length, 1, 'grant attempted')
      assert.equal(
        fakes.state.markProcessedCalls.length,
        0,
        'markEventProcessed must NOT fire on dispatch failure — keeps processed_at NULL for retry',
      )
    } finally {
      await server.close()
    }
  })
})

describe('billing-webhook router — dispatch routing', () => {
  it('ignores non-supporter checkout (mode=subscription) — no grant call', async () => {
    const fakes = makeFakes()
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        type: 'checkout.session.completed',
        data: {
          id: 'cs_test_sub',
          mode: 'subscription',
          metadata: { userId: 'user-123' },
        },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 200)
      assert.equal(fakes.state.grantSupporterCalls.length, 0)
      assert.equal(fakes.state.markProcessedCalls.length, 1, 'still marked processed')
    } finally {
      await server.close()
    }
  })

  it('ignores supporter-mode checkout when userId metadata is missing — no grant', async () => {
    const fakes = makeFakes()
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        type: 'checkout.session.completed',
        data: {
          id: 'cs_test_no_user',
          mode: 'payment',
          metadata: { tier: 'supporter_lifetime' },
        },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 200)
      assert.equal(fakes.state.grantSupporterCalls.length, 0)
    } finally {
      await server.close()
    }
  })

  it('falls back to client_reference_id when metadata.userId is absent', async () => {
    const fakes = makeFakes()
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        type: 'checkout.session.completed',
        data: {
          id: 'cs_test_cref',
          mode: 'payment',
          metadata: { tier: 'supporter_lifetime' },
          client_reference_id: 'user-from-cref',
        },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 200)
      assert.deepEqual(fakes.state.grantSupporterCalls, ['user-from-cref'])
    } finally {
      await server.close()
    }
  })

  it('upserts subscription on customer.subscription.updated', async () => {
    const fakes = makeFakes({ resolveUserResult: 'user-sub-1' })
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        type: 'customer.subscription.updated',
        data: {
          id: 'sub_xyz',
          customer: 'cus_abc',
          status: 'active',
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_supporter_monthly' } }] },
        },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 200)
      assert.deepEqual(fakes.state.resolveUserCalls, ['cus_abc'])
      assert.equal(fakes.state.upsertCalls.length, 1)
      const upsert = fakes.state.upsertCalls[0]!
      assert.equal(upsert.userId, 'user-sub-1')
      assert.equal(upsert.stripeSubscriptionId, 'sub_xyz')
      assert.equal(upsert.stripePriceId, 'price_supporter_monthly')
      assert.equal(upsert.status, 'active')
    } finally {
      await server.close()
    }
  })

  it('drops subscription event for unknown customer (no upsert)', async () => {
    const fakes = makeFakes({ resolveUserResult: null })
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        type: 'customer.subscription.updated',
        data: {
          id: 'sub_unknown',
          customer: 'cus_unknown',
          status: 'active',
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_x' } }] },
        },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 200)
      assert.equal(fakes.state.upsertCalls.length, 0)
      // Still marks processed — dropping an unknown-customer event is success, not retry.
      assert.equal(fakes.state.markProcessedCalls.length, 1)
    } finally {
      await server.close()
    }
  })

  it('clears stripe_customer_id on customer.deleted', async () => {
    const fakes = makeFakes({ resolveUserResult: 'user-deleted-1' })
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        type: 'customer.deleted',
        data: { id: 'cus_gone', object: 'customer' },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 200)
      assert.deepEqual(fakes.state.clearStripeCustomerCalls, ['user-deleted-1'])
    } finally {
      await server.close()
    }
  })

  it('revokes supporter lifetime on charge.refunded for a one-time charge', async () => {
    const fakes = makeFakes({ resolveUserResult: 'user-refunded-1' })
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        type: 'charge.refunded',
        data: {
          id: 'ch_one_time',
          customer: 'cus_one_time',
          // No `invoice` field — this is a one-time supporter charge.
        },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 200)
      assert.deepEqual(fakes.state.revokeSupporterCalls, [
        { userId: 'user-refunded-1', reason: 'charge.refunded' },
      ])
    } finally {
      await server.close()
    }
  })

  it('does NOT revoke on charge.refunded for a subscription charge (has invoice)', async () => {
    const fakes = makeFakes({ resolveUserResult: 'user-sub-refund' })
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        type: 'charge.refunded',
        data: {
          id: 'ch_subscription',
          customer: 'cus_sub',
          invoice: 'in_123', // presence of invoice routes to subscription path
        },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 200)
      assert.equal(
        fakes.state.revokeSupporterCalls.length,
        0,
        'subscription-tier refunds must be handled by subscription.updated, not here',
      )
    } finally {
      await server.close()
    }
  })

  it('ignores unknown event types without error', async () => {
    const fakes = makeFakes()
    const server = await serveRouter(fakes.deps)
    try {
      const event = buildEvent({
        type: 'invoice.created', // not in the switch
        data: { id: 'in_unknown' },
      })
      const res = await signedPost(server.url, event)
      assert.equal(res.status, 200)
      assert.equal(fakes.state.grantSupporterCalls.length, 0)
      assert.equal(fakes.state.upsertCalls.length, 0)
      assert.equal(fakes.state.markProcessedCalls.length, 1)
    } finally {
      await server.close()
    }
  })
})
