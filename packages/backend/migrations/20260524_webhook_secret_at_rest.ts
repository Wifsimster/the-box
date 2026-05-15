import type { Knex } from 'knex'

// Closes the M2 webhook-signing limitation: the plaintext signing secret
// used to live only in process memory, so a backend restart blanked
// signatures until the owner re-registered the webhook.
//
// `secret_enc` stores the secret encrypted with AES-256-GCM (see
// infrastructure/crypto/secret-box.ts). The plaintext is never persisted;
// `secret_hash` (added in 20260523) stays for completeness but the worker
// now decrypts `secret_enc` to sign outgoing deliveries.
//
// Nullable: rows created before this migration (none in production, but a
// dev DB that ran 20260523 first) keep working — the worker treats a null
// `secret_enc` the same way it used to treat a cache miss (unsigned send).

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
