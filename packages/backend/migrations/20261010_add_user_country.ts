import type { Knex } from 'knex'

// Self-declared player country for the monthly country ranking. Optional
// (NULL = not set) and never filled from the IP or the browser locale: the
// player picks it on their profile. ISO 3166-1 alpha-2, validated against
// COUNTRY_CODES in @the-box/types by PUT /api/user/profile.

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('user', 'country')
  if (!hasColumn) {
    await knex.schema.alterTable('user', (table) => {
      table.string('country', 2).nullable()
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('user', 'country')
  if (hasColumn) {
    await knex.schema.alterTable('user', (table) => {
      table.dropColumn('country')
    })
  }
}
