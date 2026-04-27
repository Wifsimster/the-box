import type { Knex } from 'knex'

// Switches the geo daily-rotation model to a slow, manual rollout: a single
// `is_current=true` row per tier marks the challenge currently shown on the
// geo page. New challenges no longer auto-rotate at midnight — admins decide
// when to release the next one. The recurring scheduler is disabled in
// `index.ts`; the manual escape-hatch route still works and now also flips
// the new row's `is_current` flag (rotating off whatever was previous).
//
// The partial unique index enforces "at most one current per tier" without
// requiring NULL-juggling: only rows with `is_current = true` participate.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_challenge', (table) => {
    table.boolean('is_current').notNullable().defaultTo(false)
  })

  // Backfill: the most recent challenge per tier becomes the current one.
  // Without this, /api/geo/current would 404 the moment the migration lands
  // even though there are perfectly playable rows in the table.
  await knex.raw(`
    UPDATE geo_challenge gc
    SET is_current = true
    FROM (
      SELECT DISTINCT ON (tier) id, tier
      FROM geo_challenge
      ORDER BY tier, challenge_date DESC, id DESC
    ) latest
    WHERE gc.id = latest.id
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX geo_challenge_one_current_per_tier
    ON geo_challenge (tier)
    WHERE is_current = true
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS geo_challenge_one_current_per_tier')
  await knex.schema.alterTable('geo_challenge', (table) => {
    table.dropColumn('is_current')
  })
}
