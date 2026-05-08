import type { Knex } from 'knex'

// Adds `confidence` to geo_pin_submission so contributors can flag
// how sure they are when they drop a pin (1=sure, 2=approx, 3=guess).
// Captured for both contribution pins and free-play guesses.
//
// The column is nullable because:
//   1. Existing rows have no confidence to backfill (we can't infer
//      it without the player), so they should explicitly read as
//      "unspecified".
//   2. The UI keeps confidence optional — submitting without picking
//      a chip is allowed and treated as "sure" by the future
//      consensus weighter (defined in a follow-up; this migration
//      only adds storage).
//
// CHECK constraint enforces the {1,2,3} range so no rogue value can
// land via a future bug or a hand-rolled INSERT.

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasColumn('geo_pin_submission', 'confidence')
  if (exists) return
  await knex.schema.alterTable('geo_pin_submission', (t) => {
    t.smallint('confidence').nullable()
  })
  await knex.raw(
    `ALTER TABLE geo_pin_submission
       ADD CONSTRAINT geo_pin_submission_confidence_range
       CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 3)`,
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE geo_pin_submission
       DROP CONSTRAINT IF EXISTS geo_pin_submission_confidence_range`,
  )
  const exists = await knex.schema.hasColumn('geo_pin_submission', 'confidence')
  if (!exists) return
  await knex.schema.alterTable('geo_pin_submission', (t) => {
    t.dropColumn('confidence')
  })
}
