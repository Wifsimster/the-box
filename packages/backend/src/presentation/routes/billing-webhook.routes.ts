import express, { Router } from 'express'
import type Stripe from 'stripe'
import { getStripe } from '../../infrastructure/stripe/stripe.client.js'
import { env } from '../../config/env.js'
import {
  subscriptionRepository,
  stripeEventLogRepository,
} from '../../infrastructure/repositories/subscription.repository.js'
import { userRepository } from '../../infrastructure/repositories/user.repository.js'
import { billingService } from '../../domain/services/billing.service.js'
import { logger } from '../../infrastructure/logger/logger.js'

const log = logger.child({ route: 'billing-webhook' })

// Mounted at the very top of index.ts BEFORE express.json(), because Stripe
// signature verification requires the raw request bytes. Using a path-scoped
// raw parser keeps every other route on the existing JSON pipeline.

const router = Router()

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature']
    if (!signature || typeof signature !== 'string') {
      res.status(400).send('missing stripe-signature header')
      return
    }
    if (!env.STRIPE_WEBHOOK_SECRET) {
      log.error('STRIPE_WEBHOOK_SECRET is not configured — refusing webhook')
      res.status(503).send('webhook not configured')
      return
    }

    let event: Stripe.Event
    try {
      const stripe = getStripe()
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      )
    } catch (err) {
      log.warn({ err: String(err) }, 'webhook signature verification failed')
      res.status(400).send(`signature verification failed: ${err instanceof Error ? err.message : 'unknown'}`)
      return
    }

    // Always 200 after we successfully apply (or detect duplicate); Stripe
    // retries 5xx aggressively. Errors past this point return 500 so we get
    // retried — but the idempotency check inside ensures we never apply
    // twice even if our handler crashes after a partial DB write.
    try {
      const { alreadyApplied } = await stripeEventLogRepository.record(event.id, event.type)
      if (alreadyApplied) {
        res.json({ received: true, duplicate: true })
        return
      }

      await dispatch(event)
      res.json({ received: true })
    } catch (err) {
      log.error({ err: String(err), eventId: event.id, type: event.type }, 'webhook handler failed')
      res.status(500).send('webhook handler error')
    }
  },
)

async function dispatch(event: Stripe.Event): Promise<void> {
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

      await userRepository.grantSupporterLifetime(userId)
      log.info({ userId, sessionId: session.id }, 'supporter lifetime granted')
      return
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      const userId = await billingService.resolveUserIdFromCustomer(customerId)
      if (!userId) {
        log.warn(
          { eventType: event.type, customerId, subscriptionId: sub.id },
          'subscription event for unknown customer',
        )
        return
      }
      const fields = billingService.fromStripeSubscription(sub)
      await subscriptionRepository.upsert({
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

    default:
      // Stripe sends a lot of event types we don't care about; logging at
      // debug keeps prod logs clean while preserving traceability.
      log.debug({ eventType: event.type }, 'webhook event ignored')
  }
}

export default router
