import Stripe from 'stripe'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

// Lazy singleton: don't crash boot if STRIPE_SECRET_KEY is missing in dev,
// but every billing code path that actually needs Stripe must call
// getStripe() rather than importing a top-level instance. That way unit
// tests can boot the app without touching Stripe and prod still gets a
// loud failure the moment a billing route is hit without configuration.

let client: Stripe | null = null

export function getStripe(): Stripe {
  if (client) return client
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured — billing endpoints will not work')
  }
  client = new Stripe(env.STRIPE_SECRET_KEY)
  logger.info(
    { mode: env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test' },
    'stripe client initialized',
  )
  return client
}

export function isStripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY
}
