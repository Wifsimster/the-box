import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.string('referred_by').nullable()
    table.timestamp('referral_claimed_at').nullable()
  })

  await knex.raw('CREATE INDEX idx_user_referred_by ON "user"(referred_by)')
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_user_referred_by')

  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('referred_by')
    table.dropColumn('referral_claimed_at')
  })
}
