import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasColumn('games', 'real_world_setting')
  if (exists) return
  await knex.schema.alterTable('games', (t) => {
    t.boolean('real_world_setting').notNullable().defaultTo(false)
  })
  await knex.schema.alterTable('games', (t) => {
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
