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

export const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
])

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

export const stripeEventLogRepository = {
  async claimEvent(eventId: string, type: string): Promise<{ alreadyProcessed: boolean }> {
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
