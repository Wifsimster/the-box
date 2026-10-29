import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_challenge', (table) => {
    table.boolean('is_current').notNullable().defaultTo(false)
  })

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
