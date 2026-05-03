import type { Knex } from 'knex'

// Idempotency + inbox layer for asynchronous rewards (reactivation,
// milestones, leaderboard payouts, cosmetic unlocks, streak freeze
// auto-grants). Every grant flowing through `rewardsService.grant()`
// inserts one row here BEFORE upserting `user_inventory`. The
// `(user_id, source, source_ref)` unique index makes BullMQ retries safe:
// the second attempt hits the conflict, the inventory upsert is skipped,
// and the worker can move on without double-spending.
//
// `unlocked_at` separates "reward staged" from "reward usable" — the
// reactivation chest stages the row when the user is flagged inactive,
// then sets `unlocked_at` once the user submits a guess on return so the
// reward is earned through play, not just login.
//
// `claimed_at` separates "reward usable" from "user picked it up" — the
// `RewardsInbox` UI marks rows claimed_at on the explicit Réclamer click.
// Together they let the inbox render three buckets (pending, ready,
// claimed) without status enums.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reward_grants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('user_id', 64).notNullable()
    // Discriminator for the source stream. Kept as a free string (not a
    // pg enum) so adding a new stream is a code-only change with no
    // migration. Validated in the domain layer.
    table.string('source', 40).notNullable()
    // Per-stream natural key that makes the grant idempotent. Examples:
    //   reactivation:2026-W18
    //   milestone:games_played_100
    //   streak_freeze:2026-05
    //   leaderboard_payout:monthly:2026-04
    // Always lowercase, colon-separated, ASCII.
    table.string('source_ref', 120).notNullable()
    // The actual reward contents. Shape: { items: [{itemType,itemKey,quantity}] }.
    // Kept as JSONB so we can grep with pg operators when reconciling
    // missed socket emits.
    table.jsonb('payload').notNullable()
    table.timestamp('granted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    // Null until the reward becomes claimable. For sources that are
    // immediately usable (milestones, payouts, streak_freeze), the same
    // transaction sets unlocked_at = granted_at. Reactivation leaves it
    // null until the user submits a guess.
    table.timestamp('unlocked_at', { useTz: true }).nullable()
    // Null until the user clicks Réclamer in the inbox.
    table.timestamp('claimed_at', { useTz: true }).nullable()

    // Idempotency contract: at most one row per (user, source, source_ref).
    table.unique(['user_id', 'source', 'source_ref'], {
      indexName: 'reward_grants_user_source_ref_uniq',
    })
    // Inbox query: list unclaimed rewards for a user, newest first.
    table.index(['user_id', 'claimed_at', 'granted_at'], 'reward_grants_inbox_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reward_grants')
}
