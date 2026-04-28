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

// Webhook idempotency: every event we accept is logged here in the same
// transaction as its side effect. A duplicate event hits the unique PK and
// the handler short-circuits without re-applying.
export const stripeEventLogRepository = {
  async record(eventId: string, type: string): Promise<{ alreadyApplied: boolean }> {
    try {
      await db('stripe_event_log').insert({
        event_id: eventId,
        type,
      })
      return { alreadyApplied: false }
    } catch (err) {
      // Postgres unique violation → duplicate event, safe to ignore.
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code?: string }).code === '23505'
      ) {
        log.info({ eventId, type }, 'duplicate webhook event ignored')
        return { alreadyApplied: true }
      }
      throw err
    }
  },
}
