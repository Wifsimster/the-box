import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasEnabled = await knex.schema.hasColumn('user', 'public_profile_enabled')
  if (!hasEnabled) {
    await knex.schema.alterTable('user', (table) => {
      table.boolean('public_profile_enabled').notNullable().defaultTo(false)
    })
  }

  const hasSlug = await knex.schema.hasColumn('user', 'public_slug')
  if (!hasSlug) {
    await knex.schema.alterTable('user', (table) => {
      table.string('public_slug', 32).nullable()
      table.unique(['public_slug'], { indexName: 'user_public_slug_uniq' })
    })
  }

  const hasTable = await knex.schema.hasTable('api_keys')
  if (!hasTable) {
    await knex.schema.createTable('api_keys', (table) => {
      table.increments('id').primary()
      table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.string('key_hash', 64).notNullable()
      table.string('key_prefix', 24).notNullable()
      table.string('label', 64).notNullable()
      table.string('mode', 8).notNullable().defaultTo('live')
      table.specificType('scopes', 'text[]').notNullable().defaultTo(
        knex.raw(`ARRAY['read:public','read:self','stream:self','webhooks:self']::text[]`)
      )
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp('last_used_at', { useTz: true }).nullable()
      table.string('last_used_ip', 64).nullable()
      table.timestamp('revoked_at', { useTz: true }).nullable()

      table.unique(['key_hash'], { indexName: 'api_keys_hash_uniq' })
      table.index(['user_id', 'is_active'], 'api_keys_user_active_idx')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('api_keys')

  const hasSlug = await knex.schema.hasColumn('user', 'public_slug')
  if (hasSlug) {
    await knex.schema.alterTable('user', (table) => {
      table.dropUnique(['public_slug'], 'user_public_slug_uniq')
      table.dropColumn('public_slug')
    })
  }

  const hasEnabled = await knex.schema.hasColumn('user', 'public_profile_enabled')
  if (hasEnabled) {
    await knex.schema.alterTable('user', (table) => {
      table.dropColumn('public_profile_enabled')
    })
  }
}
