import type { Knex } from 'knex'

// Pin provenance for agent-proposed pins (issue #331, phase 4).
//
// Until now every geo_pin_submission was authored by a logged-in user
// (user_id NOT NULL, unique per (user, candidate)). The automated pin proposer
// submits pins that have NO user — they belong to a geo-agent API key, are
// flagged by `source`, and are DOWNWEIGHTED in consensus. Critically, agent
// pins can never promote a candidate on their own: the consensus service (v3)
// counts only accepted HUMAN pins toward the promote gate, so this schema
// change is safe by construction — it can add votes, never ground truth.
//
// Changes:
//   - user_id becomes nullable (agent pins have no user).
//   - source: 'human' | 'agent_structured' | 'agent_vision' (default 'human'
//     backfills every existing row correctly).
//   - agent_key_id: FK to the minting api_keys row (SET NULL on revoke so the
//     pin's history survives; the pin stays flagged via `source`).
//   - agent_rationale / agent_model: the review artifact for a machine pin.
//   - vision_pass: lets one key submit multiple independent vision passes per
//     candidate (each a separate downweighted voter) without tripping the
//     unique index.
//   - CHECK: exactly one owner kind — a human pin has a user and no key; an
//     agent pin has a key and no user.

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

  // Drop NOT NULL via raw SQL so we don't disturb the existing FK on user_id.
  await knex.raw('ALTER TABLE geo_pin_submission ALTER COLUMN user_id DROP NOT NULL')

  await knex.raw(`
    ALTER TABLE geo_pin_submission
    ADD CONSTRAINT geo_pin_owner_check CHECK (
      (user_id IS NOT NULL AND agent_key_id IS NULL AND source = 'human') OR
      (user_id IS NULL AND agent_key_id IS NOT NULL AND source <> 'human')
    )
  `)

  // One pin per (agent key, candidate, vision pass). Partial so it doesn't
  // constrain the human rows (which keep their (user_id, candidate) unique).
  await knex.raw(`
    CREATE UNIQUE INDEX geo_pin_agent_uniq
    ON geo_pin_submission (agent_key_id, geo_screenshot_candidate_id, vision_pass)
    WHERE agent_key_id IS NOT NULL
  `)

  // Cheap lookup/filtering of machine pins in the review queue.
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

  // Down is DATA-DESTRUCTIVE by design: agent pins have no user_id, so they
  // must be deleted before user_id can go back to NOT NULL. Ground truth
  // (geo_screenshot_meta) is untouched — it was only ever promoted by human
  // consensus or an admin, never by agent pins.
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
