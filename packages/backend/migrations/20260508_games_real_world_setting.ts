import type { Knex } from 'knex'

// Adds `real_world_setting` to the games table so the geo cold-start
// shuffle can bias toward titles set in real geography (GTA → LA,
// Yakuza → Tokyo, Watch Dogs → Chicago) for first-time visitors.
//
// The playtest persona's #1 cold-start finding: a fresh player landing
// on a fictional-world game (Hyrule, Tamriel, Zebes) has no mental
// model for what to pin. Real-world titles ship with one for free.
//
// Default false so existing rows don't get mis-flagged. An admin can
// opt-in known games via SQL or a follow-up admin UI; until that
// happens the bias logic gracefully no-ops (every game is "fictional"
// from the algorithm's POV → uniform random selection).
//
// NOT NULL with a default keeps SELECT shapes predictable — the
// frontend never has to coerce undefined → false at the boundary.

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasColumn('games', 'real_world_setting')
  if (exists) return
  await knex.schema.alterTable('games', (t) => {
    t.boolean('real_world_setting').notNullable().defaultTo(false)
  })
  await knex.schema.alterTable('games', (t) => {
    // Index only the small "real-world" subset — most rows are false,
    // so a partial index keeps the bytes minimal while still letting
    // a future server-side bias query short-circuit on it.
    t.index(['real_world_setting'], 'games_real_world_setting_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasColumn('games', 'real_world_setting')
  if (!exists) return
  await knex.schema.alterTable('games', (t) => {
    t.dropIndex(['real_world_setting'], 'games_real_world_setting_idx')
  })
  await knex.schema.alterTable('games', (t) => {
    t.dropColumn('real_world_setting')
  })
}
