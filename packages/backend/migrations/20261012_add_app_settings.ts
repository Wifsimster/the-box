import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('app_settings')
  if (exists) return

  await knex.schema.createTable('app_settings', (table) => {
    table.string('key', 100).primary()
    table.jsonb('value').nullable()
    table.text('secret_ciphertext').nullable()
    table.text('updated_by').nullable().references('id').inTable('user').onDelete('SET NULL')
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('app_settings')
}
