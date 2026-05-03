import type { Knex } from 'knex'

// Holdout cohort tracking for the reactivation chest A/B. Per PRD, 10% of
// eligible users (deterministic hash on user_id, NOT user_id+week, so a
// user is always treatment or always holdout for THIS feature) skip the
// chest grant but still receive the warm welcome-back email — so we can
// measure D30 lift treatment-vs-holdout cleanly.
//
// Composite PK on (user_id, week) so the same user can be flagged across
// multiple cycles without dups, and so the BullMQ worker can ON CONFLICT
// DO NOTHING when re-scanning the same week.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reactivation_holdouts', (table) => {
    table.string('user_id', 64).notNullable()
    // ISO week label `YYYY-Www`, lowercase, e.g. `2026-w19`. Mirrors the
    // reward_grants.source_ref shape so cross-table joins are trivial.
    table.string('week', 10).notNullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.primary(['user_id', 'week'], { constraintName: 'reactivation_holdouts_pkey' })
    table.index(['week'], 'reactivation_holdouts_week_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reactivation_holdouts')
}
