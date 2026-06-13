import express, { Router } from 'express'
import type Stripe from 'stripe'
import { getStripe as getStripeProd } from '../../infrastructure/stripe/stripe.client.js'
import { env } from '../../config/env.js'
import {
  subscriptionRepository as subscriptionRepoProd,
  stripeEventLogRepository as stripeEventLogRepoProd,
  type UpsertSubscriptionInput,
} from '../../infrastructure/repositories/subscription.repository.js'
import { userRepository as userRepoProd } from '../../infrastructure/repositories/user.repository.js'
import { billingService as billingServiceProd } from '../../domain/services/billing.composition.js'
import { logger as loggerProd } from '../../infrastructure/logger/logger.js'
import type { DomainLogger } from '../../domain/ports/logger.js'

// Mounted at the very top of index.ts BEFORE express.json(), because Stripe
// signature verification requires the raw request bytes. Using a path-scoped
// raw parser keeps every other route on the existing JSON pipeline.

// ---- Dependency-injection ports ----------------------------------------

export interface BillingWebhookEventLogRepo {
  claimEvent(eventId: string, type: string): Promise<{ alreadyProcessed: boolean }>
  markEventProcessed(eventId: string): Promise<void>
}

export interface BillingWebhookUserRepo {
  grantSupporterLifetime(userId: string, grantedAt?: Date): Promise<boolean>
  revokeSupporterLifetime(userId: string, reason: string): Promise<boolean>
  clearStripeCustomerId(userId: string): Promise<void>
}

export interface BillingWebhookSubscriptionRepo {
  upsert(input: UpsertSubscriptionInput): Promise<unknown>
}

export interface BillingWebhookBillingService {
  resolveUserIdFromCustomer(customerId: string): Promise<string | null>
  fromStripeSubscription(sub: Stripe.Subscription): Omit<UpsertSubscriptionInput, 'userId'>
}

export interface BillingWebhookDeps {
  stripeEventLogRepository: BillingWebhookEventLogRepo
  userRepository: BillingWebhookUserRepo
  subscriptionRepository: BillingWebhookSubscriptionRepo
  billingService: BillingWebhookBillingService
  getStripe: () => Stripe
  getSecrets: () => string[]
  logger: DomainLogger
}

// ---- Pure helpers (exported for tests) ---------------------------------

// STRIPE_WEBHOOK_SECRET supports comma-separated values so a rolling
// rotation (Stripe lets you keep both an old and a new signing secret on
// the same endpoint for a short window) doesn't drop events while ops
// updates the env. We try each secret in turn and accept the first that
// verifies; if none verify, we 400 like before.
export function parseWebhookSecrets(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function verifyEvent(stripe: Stripe, body: Buffer, signature: string, secrets: string[]): Stripe.Event {
  let lastErr: unknown = null
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(body, signature, secret)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr ?? new Error('no webhook secret provided')
}

// ---- Factory -----------------------------------------------------------

export function createBillingWebhookRouter(deps: BillingWebhookDeps): Router {
  const log = deps.logger.child({ route: 'billing-webhook' })
  const router = Router()

  router.post(
    '/',
    // 1 MB is well above Stripe's typical event payloads (~50 KB) but caps
    // the buffer Node allocates before signature verification runs.
    express.raw({ type: 'application/json', limit: '1mb' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature']
      if (!signature || typeof signature !== 'string') {
        res.status(400).send('missing stripe-signature header')
        return
      }
      const secrets = deps.getSecrets()
      if (secrets.length === 0) {
        log.error('STRIPE_WEBHOOK_SECRET is not configured — refusing webhook')
        res.status(503).send('webhook not configured')
        return
      }

      let event: Stripe.Event
      try {
        const stripe = deps.getStripe()
        event = verifyEvent(stripe, req.body as Buffer, signature, secrets)
      } catch (err) {
        log.warn({ err: String(err) }, 'webhook signature verification failed')
        res.status(400).send(`signature verification failed: ${err instanceof Error ? err.message : 'unknown'}`)
        return
      }

      // Two-phase idempotency. Claim the event first so concurrent retries
      // see processed_at IS NULL and don't both run side effects naïvely (the
      // writes themselves are idempotent, but skipping needless work is
      // cheaper). Only after dispatch returns successfully do we stamp
      // processed_at — a 5xx mid-dispatch keeps processed_at NULL so the
      // next retry re-runs the handler instead of being silently skipped.
      try {
        const { alreadyProcessed } = await deps.stripeEventLogRepository.claimEvent(event.id, event.type)
        if (alreadyProcessed) {
          res.json({ received: true, duplicate: true })
          return
        }

        await dispatch(deps, log, event)
        await deps.stripeEventLogRepository.markEventProcessed(event.id)
        res.json({ received: true })
      } catch (err) {
        log.error(
          { err: String(err), eventId: event.id, type: event.type },
          'webhook handler failed',
        )
        // 5xx signals Stripe to retry; processed_at stays NULL so the retry
        // will re-dispatch instead of seeing a stale "applied" claim.
        res.status(500).send(`webhook handler error (event ${event.id})`)
      }
    },
  )

  return router
}

async function dispatch(deps: BillingWebhookDeps, log: DomainLogger, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      log.info(
        {
          mode: session.mode,
          customerId: session.customer,
          userId: session.metadata?.['userId'] ?? session.client_reference_id,
          tier: session.metadata?.['tier'],
        },
        'checkout completed',
      )

      // One-time supporter purchases never create a Subscription, so the
      // sibling customer.subscription.created handler doesn't fire. Persist
      // the grant directly here when the Checkout Session was created for
      // the supporter SKU; recurring-tier sessions fall through.
      if (session.mode !== 'payment') return
      if (session.metadata?.['tier'] !== 'supporter_lifetime') {
        log.debug({ sessionId: session.id }, 'one-time checkout ignored — not the supporter SKU')
        return
      }

      const userId =
        (session.metadata?.['userId'] as string | undefined) ??
        session.client_reference_id ??
        null
      if (!userId) {
        log.warn({ sessionId: session.id }, 'supporter checkout missing userId metadata')
        return
      }

      await deps.userRepository.grantSupporterLifetime(userId)
      log.info({ userId, sessionId: session.id }, 'supporter lifetime granted')
      return
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      const userId = await deps.billingService.resolveUserIdFromCustomer(customerId)
      if (!userId) {
        log.warn(
          { eventType: event.type, customerId, subscriptionId: sub.id },
          'subscription event for unknown customer',
        )
        return
      }
      const fields = deps.billingService.fromStripeSubscription(sub)
      await deps.subscriptionRepository.upsert({
        userId,
        ...fields,
      })
      log.info(
        { userId, subscriptionId: sub.id, status: fields.status, eventType: event.type },
        'subscription synced',
      )
      return
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      // Just log for now — the subsequent customer.subscription.updated
      // event from Stripe carries the new status (past_due/unpaid), and
      // that's where we adjust entitlement. Email notifications belong in
      // a later iteration.
      log.warn(
        {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          // Stripe's typing exposes `subscription` only on the subscription
          // shape; cast through unknown to read it without depending on the
          // SDK's discriminated union.
          subscriptionId: (invoice as unknown as { subscription?: string }).subscription,
        },
        'invoice payment failed',
      )
      return
    }

    case 'customer.deleted': {
      // Stripe deleted the Customer (manual ops or after a long inactivity).
      // Null out our pointer so the user can re-checkout cleanly without
      // tripping over a stale customer ID; subscriptions row is left for
      // history (FK to user, status will already be canceled by Stripe).
      const customer = event.data.object as Stripe.Customer
      const userId = await deps.billingService.resolveUserIdFromCustomer(customer.id)
      if (!userId) {
        log.debug({ customerId: customer.id }, 'customer.deleted for unknown customer')
        return
      }
      await deps.userRepository.clearStripeCustomerId(userId)
      log.info({ userId, customerId: customer.id }, 'cleared stripe_customer_id after customer.deleted')
      return
    }

    case 'charge.refunded':
    case 'charge.dispute.created': {
      // Revenue-safety: a refund or dispute on the one-time supporter
      // charge must revoke entitlement, otherwise the user keeps premium
      // access for free. Subscription-tier refunds also flow through
      // charge.* events but are paired with an invoice; we let the
      // subscription.updated path handle those instead of double-acting.
      //
      // Disputes carry only a charge ref, not the full Charge — fetch
      // when needed so we have access to invoice/customer/amount in one
      // place regardless of which event variant fired.
      let charge: Stripe.Charge
      if (event.type === 'charge.refunded') {
        charge = event.data.object as Stripe.Charge
      } else {
        const dispute = event.data.object as Stripe.Dispute
        const chargeRef = dispute.charge
        if (typeof chargeRef === 'object' && chargeRef !== null) {
          charge = chargeRef
        } else {
          try {
            charge = await deps.getStripe().charges.retrieve(chargeRef)
          } catch (err) {
            log.error(
              { err: String(err), disputeId: dispute.id, chargeRef },
              'failed to retrieve charge for dispute',
            )
            return
          }
        }
      }

      // The SDK's Charge type doesn't surface `invoice` in our pinned
      // version even though the API field has always been there; cast
      // through unknown to read it without depending on the SDK shape.
      const invoiceRef = (charge as unknown as { invoice?: string | { id: string } | null }).invoice
      if (invoiceRef) {
        // Subscription-tier charge. Stripe will (or already did) emit a
        // customer.subscription.updated for this; let that path do the
        // entitlement bookkeeping so we don't have to coordinate two
        // sources of truth.
        log.debug(
          {
            chargeId: charge.id,
            type: event.type,
            invoiceId: typeof invoiceRef === 'string' ? invoiceRef : invoiceRef.id,
          },
          'refund/dispute on subscription charge — handled via subscription event',
        )
        return
      }

      const customerRef = charge.customer
      const customerId =
        typeof customerRef === 'string' ? customerRef : customerRef?.id ?? null
      if (!customerId) {
        log.warn(
          { chargeId: charge.id, type: event.type },
          'refund/dispute on one-time charge with no customer — cannot revoke',
        )
        return
      }
      const userId = await deps.billingService.resolveUserIdFromCustomer(customerId)
      if (!userId) {
        log.warn(
          { customerId, chargeId: charge.id, type: event.type },
          'refund/dispute for unknown customer',
        )
        return
      }
      const revoked = await deps.userRepository.revokeSupporterLifetime(userId, event.type)
      log.info(
        { userId, chargeId: charge.id, type: event.type, revoked },
        revoked ? 'supporter lifetime revoked' : 'supporter lifetime already absent',
      )
      return
    }

    default:
      // Stripe sends a lot of event types we don't care about; logging at
      // debug keeps prod logs clean while preserving traceability.
      log.debug({ eventType: event.type }, 'webhook event ignored')
  }
}

// ---- Default production-wired router -----------------------------------

const router = createBillingWebhookRouter({
  stripeEventLogRepository: stripeEventLogRepoProd,
  userRepository: userRepoProd,
  subscriptionRepository: subscriptionRepoProd,
  billingService: billingServiceProd,
  getStripe: getStripeProd,
  getSecrets: () => parseWebhookSecrets(env.STRIPE_WEBHOOK_SECRET),
  logger: loggerProd,
})

export default router
