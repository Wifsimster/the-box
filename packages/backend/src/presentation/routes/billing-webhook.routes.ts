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
import { billingService as billingServiceProd } from '../../composition/billing.js'
import { logger as loggerProd } from '../../infrastructure/logger/logger.js'
import type { DomainLogger } from '../../domain/ports/logger.js'


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

export function createBillingWebhookRouter(deps: BillingWebhookDeps): Router {
  const log = deps.logger.child({ route: 'billing-webhook' })
  const router = Router()

  router.post(
    '/',
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
        res.status(500).send(`webhook handler error (event ${event.id})`)
      }
    },
  )

  return router
}

async function dispatch(deps: BillingWebhookDeps, log: DomainLogger, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.async_payment_succeeded':
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

      if (session.mode !== 'payment') return
      if (session.metadata?.['tier'] !== 'supporter_lifetime') {
        log.debug({ sessionId: session.id }, 'one-time checkout ignored — not the supporter SKU')
        return
      }

      if (session.payment_status === 'unpaid') {
        log.info({ sessionId: session.id }, 'supporter checkout completed but unpaid — awaiting async payment')
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
      log.warn(
        {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          subscriptionId: (invoice as unknown as { subscription?: string }).subscription,
        },
        'invoice payment failed — entering grace window until current_period_end',
      )
      return
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      log.info(
        {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          subscriptionId: (invoice as unknown as { subscription?: string }).subscription,
        },
        'invoice paid — entitlement recovered via subscription.updated',
      )
      return
    }

    case 'customer.deleted': {
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
            throw err
          }
        }
      }

      const invoiceRef = (charge as unknown as { invoice?: string | { id: string } | null }).invoice
      if (invoiceRef) {
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
      log.debug({ eventType: event.type }, 'webhook event ignored')
  }
}

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
