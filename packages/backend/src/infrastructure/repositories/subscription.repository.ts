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

// Statuses that grant premium entitlement unconditionally. `trialing` is
// included so a Stripe trial without payment still unlocks features.
export const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
])

// Statuses that grant a *time-limited* grace entitlement: the user keeps
// premium only while the already-paid period hasn't ended. `past_due` means a
// renewal charge failed and Stripe is still retrying (smart retries run for
// days) — revoking on the first failure would punish a transient card decline,
// so we hold entitlement until current_period_end and let the eventual
// unpaid/canceled transition (or period expiry) drop it. Everything not in
// either set (canceled, incomplete, unpaid, ...) is treated as free.
export const GRACE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'past_due',
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
    // Most recent entitled subscription wins. Entitled = an unconditional
    // status (active/trialing) OR a grace status (past_due) whose already-paid
    // period hasn't ended yet. A user shouldn't have multiple active subs at
    // once, but checkout idempotency in the wild means we sometimes see two —
    // ordering by current_period_end desc picks the latest grant (and prefers
    // a genuine active sub over a lapsing past_due one) so the UI's "Premium
    // until …" reflects reality.
    const now = new Date()
    const row = await db('subscriptions')
      .where({ user_id: userId })
      .andWhere((qb) => {
        qb.whereIn('status', Array.from(ENTITLED_STATUSES)).orWhere((grace) => {
          grace
            .whereIn('status', Array.from(GRACE_STATUSES))
            .andWhere('current_period_end', '>', now)
        })
      })
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
