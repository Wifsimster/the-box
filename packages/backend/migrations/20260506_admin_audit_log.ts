import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admin_audit_log', (table) => {
    table.bigIncrements('id').primary()
    table.string('admin_id', 64).notNullable()
    table.string('action', 100).notNullable()
    table.string('target_kind', 64).notNullable()
    table.string('target_id', 100).nullable()
    table.jsonb('before').nullable()
    table.jsonb('after').nullable()
    table.string('request_id', 64).nullable()
    table.string('ip', 64).nullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.index(['admin_id', 'created_at'], 'admin_audit_log_admin_idx')
    table.index(['target_kind', 'target_id'], 'admin_audit_log_target_idx')
    table.index('action', 'admin_audit_log_action_idx')
    table.index('created_at', 'admin_audit_log_created_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_audit_log')
}
