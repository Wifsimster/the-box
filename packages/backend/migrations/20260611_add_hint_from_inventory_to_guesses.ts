import type { Knex } from 'knex'

/**
 * Records whether the hint attached to a guess was paid for from inventory
 * (or granted free via premium catch-up) rather than via the 20 % score
 * penalty. `power_up_used` alone can't distinguish the two cases, and both
 * the session-details view and the admin score-recalculation worker need to
 * know which guesses actually carried a penalty.
 *
 * Historical rows predate `power_up_used` being persisted at all, so they
 * stay NULL/false — no backfill is possible.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('guesses', (table) => {
    table.boolean('hint_from_inventory').notNullable().defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('guesses', (table) => {
    table.dropColumn('hint_from_inventory')
  })
}
