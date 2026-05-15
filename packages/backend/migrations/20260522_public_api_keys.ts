import type { Knex } from 'knex'

// Public-API foundation for the Streamer Kit. Adds:
//   - api_keys: SHA-256 hashed bearer tokens (tb_pk_live_… / tb_pk_test_…)
//     issued to opted-in streamers. We never store the plaintext; the
//     dashboard shows it once at creation. last_used_at + last_used_ip
//     give the owner a "where is this key being used" signal without
//     digging through logs.
//   - user.public_profile_enabled: hard gate on every public-API read of
//     this user's data. Defaults to false; flipped via the settings page.
//   - user.public_slug: URL-safe identifier used in /api/public/v1/streamers/:slug.
//     Separate from `username` so streamers can pick a public handle that
//     matches their Twitch/YouTube without renaming their account.

export async function up(knex: Knex): Promise<void> {
  // 1. user columns first — api_keys references user.id.
  const hasEnabled = await knex.schema.hasColumn('user', 'public_profile_enabled')
  if (!hasEnabled) {
    await knex.schema.alterTable('user', (table) => {
      table.boolean('public_profile_enabled').notNullable().defaultTo(false)
    })
  }

  const hasSlug = await knex.schema.hasColumn('user', 'public_slug')
  if (!hasSlug) {
    await knex.schema.alterTable('user', (table) => {
      // Lowercase ASCII letters, digits, dash, underscore; 3-32 chars.
      // Nullable because most users will never set one. Unique when set.
      table.string('public_slug', 32).nullable()
      table.unique(['public_slug'], { indexName: 'user_public_slug_uniq' })
    })
  }

  // 2. api_keys table.
  const hasTable = await knex.schema.hasTable('api_keys')
  if (!hasTable) {
    await knex.schema.createTable('api_keys', (table) => {
      table.increments('id').primary()
      table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
      // SHA-256 hex digest of the bearer token. 64 chars exactly.
      table.string('key_hash', 64).notNullable()
      // First 16 chars of the plaintext (e.g. "tb_pk_live_a1b2c"), shown
      // in the dashboard so the owner can identify which key is which
      // without us storing the secret.
      table.string('key_prefix', 24).notNullable()
      // Human label set at creation: "OBS overlay", "Nightbot", etc.
      table.string('label', 64).notNullable()
      // 'live' or 'test'. Test keys cannot send webhooks and read from
      // the demo replay slug; see public.routes.ts.
      table.string('mode', 8).notNullable().defaultTo('live')
      // Reserved for M2 — scope list lives here so M1 can ship without
      // a follow-up migration. Default grants all four scopes against
      // the owner's own data.
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
