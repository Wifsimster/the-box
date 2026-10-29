import { Router } from 'express'
import { z } from 'zod'
import type { BillingTier } from '@the-box/types'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'
import {
  billingService,
} from '../../composition/services.js'
import { getCatalogEntry } from '../../config/billing.js'
import { getStripe, isStripeConfigured } from '../../infrastructure/stripe/stripe.client.js'
import { resolvePriceId } from '../../infrastructure/stripe/billing-catalog.resolver.js'
import { env } from '../../config/env.js'
import { logger } from '../../infrastructure/logger/logger.js'

const log = logger.child({ route: 'billing' })

const router = Router()

const TIERS = ['premium_monthly', 'premium_annual', 'supporter_lifetime'] as const satisfies readonly BillingTier[]

router.get('/prices', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=300')
    const prices = await billingService.listPublicPrices()
    res.json({ success: true, data: { prices } })
  } catch (err) {
    next(err)
  }
})

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const entitlement = await billingService.getEntitlement(req.userId!)
    res.json({ success: true, data: entitlement })
  } catch (err) {
    next(err)
  }
})

const checkoutBodySchema = z.object({
  tier: z.enum(TIERS),
})

router.post('/checkout', authMiddleware, validateBody(checkoutBodySchema), async (req, res, next) => {
  try {
    if (!isStripeConfigured()) {
      res.status(503).json({
        success: false,
        error: { code: 'BILLING_NOT_CONFIGURED', message: 'Billing is not enabled on this server' },
      })
      return
    }

    const { tier } = req.body as z.infer<typeof checkoutBodySchema>
    const entry = getCatalogEntry(tier)
    if (!entry) {
      res.status(500).json({
        success: false,
        error: { code: 'PRICE_NOT_CONFIGURED', message: `No catalog entry for ${tier}` },
      })
      return
    }
    const stripePriceId = await resolvePriceId(tier)
    if (!stripePriceId) {
      res.status(500).json({
        success: false,
        error: { code: 'PRICE_NOT_CONFIGURED', message: `No active Stripe price for lookup_key "${entry.lookupKey}"` },
      })
      return
    }

    const user = req.user!
    if (!user.email) {
      res.status(400).json({
        success: false,
        error: { code: 'EMAIL_REQUIRED', message: 'Sign up with a real email before subscribing' },
      })
      return
    }

    const customerId = await billingService.ensureStripeCustomer({
      userId: user.id,
      email: user.email,
      name: user.name ?? undefined,
    })

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: entry.interval === null ? 'payment' : 'subscription',
      customer: customerId,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: env.STRIPE_CHECKOUT_SUCCESS_URL,
      cancel_url: env.STRIPE_CHECKOUT_CANCEL_URL,
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      client_reference_id: user.id,
      metadata: { userId: user.id, tier },
    })

    if (!session.url) {
      res.status(500).json({
        success: false,
        error: { code: 'CHECKOUT_SESSION_NO_URL', message: 'Stripe did not return a redirect URL' },
      })
      return
    }

    log.info({ userId: user.id, tier, sessionId: session.id }, 'checkout session created')
    res.json({ success: true, data: { url: session.url } })
  } catch (err) {
    next(err)
  }
})

router.post('/portal', authMiddleware, async (req, res, next) => {
  try {
    if (!isStripeConfigured()) {
      res.status(503).json({
        success: false,
        error: { code: 'BILLING_NOT_CONFIGURED', message: 'Billing is not enabled on this server' },
      })
      return
    }

    const customerId = await billingService.ensureStripeCustomer({
      userId: req.user!.id,
      email: req.user!.email,
      name: req.user!.name ?? undefined,
    })

    const stripe = getStripe()
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: env.STRIPE_PORTAL_RETURN_URL,
      ...(env.STRIPE_PORTAL_CONFIG_ID
        ? { configuration: env.STRIPE_PORTAL_CONFIG_ID }
        : {}),
    })

    res.json({ success: true, data: { url: session.url } })
  } catch (err) {
    next(err)
  }
})

export default router
