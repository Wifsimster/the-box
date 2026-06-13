import { Router } from 'express'
import { z } from 'zod'
import type { BillingTier } from '@the-box/types'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'
import { billingService } from '../../domain/services/index.js'
import { getCatalogEntry } from '../../config/billing.js'
import { getStripe, isStripeConfigured } from '../../infrastructure/stripe/stripe.client.js'
import { resolvePriceId } from '../../infrastructure/stripe/billing-catalog.resolver.js'
import { env } from '../../config/env.js'
import { logger } from '../../infrastructure/logger/logger.js'

const log = logger.child({ route: 'billing' })

const router = Router()

// Tiers accepted by /checkout — must each have a BILLING_CATALOG entry.
// supporter_lifetime resolves to a one-time (interval=null) price, which
// the session below turns into mode:'payment'; the other two are recurring.
const TIERS = ['premium_monthly', 'premium_annual', 'supporter_lifetime'] as const satisfies readonly BillingTier[]

// Public catalog. Used by the marketing page so the displayed amount is
// always the same string the rest of the system asserts against. Cached
// via Cache-Control to keep the page snappy without round-tripping Stripe
// on every visitor — sync-check guarantees we'd never serve stale numbers
// against a renamed price (CI fails first).
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
      // Anonymous Better Auth users have no real email; refuse so they
      // can't end up with a paid subscription nobody can recover.
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
      // Lock the line items so a tampered redirect can't trick Stripe into
      // charging for a different price than the user clicked.
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      // automatic_tax needs an address on the Customer; existing customers
      // created before address collection won't have one. Collect it at
      // checkout and write it back so subsequent invoices keep computing VAT.
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      // Carry the user back through the webhook even if the customer
      // metadata round-trip is somehow missed.
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
      // Restricts the portal to The Box Premium products. The four apps
      // share one Stripe account, so without a config a customer would
      // see WAWPTN / Tokō / CoproPilot prices in the "switch plan" picker.
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
