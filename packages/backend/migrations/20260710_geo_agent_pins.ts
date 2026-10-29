import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasSource = await knex.schema.hasColumn('geo_pin_submission', 'source')
  if (hasSource) return

  await knex.schema.alterTable('geo_pin_submission', (t) => {
    t.string('source', 20).notNullable().defaultTo('human')
    t.integer('agent_key_id').nullable().references('id').inTable('api_keys').onDelete('SET NULL')
    t.string('agent_rationale', 500).nullable()
    t.string('agent_model', 100).nullable()
    t.smallint('vision_pass').notNullable().defaultTo(0)
  })

  await knex.raw('ALTER TABLE geo_pin_submission ALTER COLUMN user_id DROP NOT NULL')

  await knex.raw(`
    ALTER TABLE geo_pin_submission
    ADD CONSTRAINT geo_pin_owner_check CHECK (
      (user_id IS NOT NULL AND agent_key_id IS NULL AND source = 'human') OR
      (user_id IS NULL AND agent_key_id IS NOT NULL AND source <> 'human')
    )
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX geo_pin_agent_uniq
    ON geo_pin_submission (agent_key_id, geo_screenshot_candidate_id, vision_pass)
    WHERE agent_key_id IS NOT NULL
  `)

  await knex.raw(`
    CREATE INDEX geo_pin_source_idx ON geo_pin_submission (source)
    WHERE source <> 'human'
  `)
}

export async function down(knex: Knex): Promise<void> {
  const hasSource = await knex.schema.hasColumn('geo_pin_submission', 'source')
  if (!hasSource) return

  await knex.raw('DROP INDEX IF EXISTS geo_pin_source_idx')
  await knex.raw('DROP INDEX IF EXISTS geo_pin_agent_uniq')
  await knex.raw('ALTER TABLE geo_pin_submission DROP CONSTRAINT IF EXISTS geo_pin_owner_check')

  await knex('geo_pin_submission').whereNotNull('agent_key_id').del()

  await knex.raw('ALTER TABLE geo_pin_submission ALTER COLUMN user_id SET NOT NULL')

  await knex.schema.alterTable('geo_pin_submission', (t) => {
    t.dropColumn('vision_pass')
    t.dropColumn('agent_model')
    t.dropColumn('agent_rationale')
    t.dropColumn('agent_key_id')
    t.dropColumn('source')
  })
}
