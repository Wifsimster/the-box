import type { Knex } from 'knex'

/**
 * Supports the personalized "beat the leader" evening nudge.
 *
 * - `last_evening_nudge_at` mirrors `last_streak_risk_email_at`: the cooldown
 *   timestamp the recurring evening-nudge worker stamps on enqueue so a BullMQ
 *   retry (or a second container) can't double-push the same user.
 * - `feature_in_notifications` is the leader's *featuring* opt-out. It is
 *   deliberately separate from `email_marketing_consent` (which governs whether
 *   a user *receives* mail) — this flag governs whether a user's name may be
 *   *mentioned* in other people's notifications when they top the board. Ships
 *   defaulted-on; the profile toggle UI is a fast-follow.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.timestamp('last_evening_nudge_at', { useTz: true }).nullable()
    table.boolean('feature_in_notifications').notNullable().defaultTo(true)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('last_evening_nudge_at')
    table.dropColumn('feature_in_notifications')
  })
}
