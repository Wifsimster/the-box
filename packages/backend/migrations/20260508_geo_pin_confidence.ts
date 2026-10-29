import type { Knex } from 'knex'

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
