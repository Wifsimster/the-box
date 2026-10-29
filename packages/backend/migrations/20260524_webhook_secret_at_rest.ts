import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('webhooks', 'secret_enc')
  if (!hasColumn) {
    await knex.schema.alterTable('webhooks', (table) => {
      table.text('secret_enc').nullable()
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('webhooks', 'secret_enc')
  if (hasColumn) {
    await knex.schema.alterTable('webhooks', (table) => {
      table.dropColumn('secret_enc')
    })
  }
}
