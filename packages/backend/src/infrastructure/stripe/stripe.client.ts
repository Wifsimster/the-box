import Stripe from 'stripe'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

let client: Stripe | null = null

export function getStripe(): Stripe {
  if (client) return client
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured — billing endpoints will not work')
  }
  client = new Stripe(env.STRIPE_SECRET_KEY)
  logger.info(
    { mode: env.STRIPE_SECRET_KEY.includes('_live_') ? 'live' : 'test' },
    'stripe client initialized',
  )
  return client
}

export function isStripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY
}
