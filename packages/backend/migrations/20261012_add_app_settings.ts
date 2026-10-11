import type { Knex } from 'knex'

/**
 * Generic runtime settings, edited from Admin → Paramètres or the settings MCP
 * tools, so features can be configured without an env change and a redeploy.
 *
 * One row per setting that differs from its default; a missing row means "use
 * the code default" (see domain/services/app-settings.service.ts, which owns
 * the registry of known keys, their types and validation).
 *
 * - `value` holds non-secret values as JSON (boolean, number, string).
 * - `secret_ciphertext` holds secret values encrypted with AES-256-GCM
 *   (infrastructure/crypto/secret-box.ts, key derived from BETTER_AUTH_SECRET).
 *   Plaintext secrets never touch this table.
 * - `updated_by` is the admin who made the last change (session or agent key
 *   owner). Every change is also written to admin_audit_log.
 */
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
