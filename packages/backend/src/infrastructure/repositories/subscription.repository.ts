import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { SubscriptionStatus } from '@the-box/types'

const log = repoLogger.child({ repository: 'subscription' })

export interface SubscriptionRow {
  id: number
  user_id: string
  stripe_subscription_id: string
  stripe_price_id: string
  status: SubscriptionStatus
  current_period_end: Date | null
  cancel_at_period_end: boolean
  created_at: Date
  updated_at: Date
}

export interface UpsertSubscriptionInput {
  userId: string
  stripeSubscriptionId: string
  stripePriceId: string
  status: SubscriptionStatus
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

// Statuses that grant premium entitlement. `trialing` is included so a Stripe
// trial without payment still unlocks features; everything else (past_due,
// canceled, incomplete, ...) treats the user as free.
export const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
])

export const subscriptionRepository = {
  async upsert(input: UpsertSubscriptionInput): Promise<SubscriptionRow> {
    log.info(
      {
        userId: input.userId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        status: input.status,
      },
      'upsert',
    )

    const [row] = await db('subscriptions')
      .insert({
        user_id: input.userId,
        stripe_subscription_id: input.stripeSubscriptionId,
        stripe_price_id: input.stripePriceId,
        status: input.status,
        current_period_end: input.currentPeriodEnd,
        cancel_at_period_end: input.cancelAtPeriodEnd,
        updated_at: new Date(),
      })
      .onConflict('stripe_subscription_id')
      .merge({
        stripe_price_id: input.stripePriceId,
        status: input.status,
        current_period_end: input.currentPeriodEnd,
        cancel_at_period_end: input.cancelAtPeriodEnd,
        updated_at: new Date(),
      })
      .returning<SubscriptionRow[]>('*')

    return row!
  },

  async findActiveByUserId(userId: string): Promise<SubscriptionRow | null> {
    // Most recent entitled-status subscription wins. A user shouldn't have
    // multiple active subs at once, but checkout idempotency in the wild
    // means we sometimes see two — pick the one with the latest period end
    // so the UI's "Premium until …" reflects the actual grant.
    const row = await db('subscriptions')
      .where({ user_id: userId })
      .whereIn('status', Array.from(ENTITLED_STATUSES))
      .orderBy('current_period_end', 'desc')
      .first<SubscriptionRow>()
    return row ?? null
  },

  async findByStripeId(stripeSubscriptionId: string): Promise<SubscriptionRow | null> {
    const row = await db('subscriptions')
      .where({ stripe_subscription_id: stripeSubscriptionId })
      .first<SubscriptionRow>()
    return row ?? null
  },

  async updateStatus(
    stripeSubscriptionId: string,
    status: SubscriptionStatus,
    currentPeriodEnd: Date | null,
    cancelAtPeriodEnd: boolean,
  ): Promise<void> {
    await db('subscriptions')
      .where({ stripe_subscription_id: stripeSubscriptionId })
      .update({
        status,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        updated_at: new Date(),
      })
  },
}

// Webhook idempotency. Two-phase: claim first (insert row, processed_at
// NULL), dispatch, then mark processed. A crash between claim and mark
// leaves processed_at NULL, so Stripe's at-least-once retry will see the
// event isn't finished and re-run dispatch — which is safe because every
// side effect is independently idempotent (ON CONFLICT upserts, NULL-
// guarded grants). Only a row with processed_at IS NOT NULL is treated as
// fully applied and short-circuited.
export const stripeEventLogRepository = {
  async claimEvent(eventId: string, type: string): Promise<{ alreadyProcessed: boolean }> {
    // Insert-or-fetch in one round trip. ON CONFLICT DO UPDATE with a
    // no-op SET (event_id = event_id) lets us read processed_at back from
    // the existing row without a second SELECT.
    const [row] = await db('stripe_event_log')
      .insert({ event_id: eventId, type })
      .onConflict('event_id')
      .merge({ event_id: eventId })
      .returning<{ processed_at: Date | null }[]>(['processed_at'])

    const alreadyProcessed = row?.processed_at !== null && row?.processed_at !== undefined
    if (alreadyProcessed) {
      log.info({ eventId, type }, 'duplicate webhook event ignored')
    }
    return { alreadyProcessed }
  },

  async markEventProcessed(eventId: string): Promise<void> {
    await db('stripe_event_log').where({ event_id: eventId }).update({
      processed_at: new Date(),
    })
  },
}
