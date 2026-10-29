import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE tiers ALTER COLUMN time_limit_seconds SET DEFAULT 45')
  await knex('tiers').where('time_limit_seconds', 30).update({ time_limit_seconds: 45 })
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE tiers ALTER COLUMN time_limit_seconds SET DEFAULT 30')
}
