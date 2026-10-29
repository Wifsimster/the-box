import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_guess', (table) => {
    table.boolean('is_skip').notNullable().defaultTo(false)
  })

  await knex.raw(`
    CREATE INDEX geo_guess_attempted_by_challenge
    ON geo_guess (geo_challenge_id)
    WHERE is_skip = false
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS geo_guess_attempted_by_challenge')
  await knex.schema.alterTable('geo_guess', (table) => {
    table.dropColumn('is_skip')
  })
}
