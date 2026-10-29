import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasColumn('geo_pin_submission', 'is_anonymous')
  if (exists) return
  await knex.schema.alterTable('geo_pin_submission', (t) => {
    t.boolean('is_anonymous').notNullable().defaultTo(false)
    t.index('is_anonymous', 'geo_pin_submission_is_anonymous_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasColumn('geo_pin_submission', 'is_anonymous')
  if (!exists) return
  await knex.schema.alterTable('geo_pin_submission', (t) => {
    t.dropIndex('is_anonymous', 'geo_pin_submission_is_anonymous_idx')
    t.dropColumn('is_anonymous')
  })
}
