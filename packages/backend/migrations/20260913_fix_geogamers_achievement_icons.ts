import type { Knex } from 'knex'

interface IconEdit {
  key: string
  to: string
  from: string
}

const EDITS: IconEdit[] = [
  { key: 'geogamers_first_run', from: 'crosshair', to: '🧭' },
  { key: 'geogamers_perfect_day', from: 'target', to: '🎯' },
]

export async function up(knex: Knex): Promise<void> {
  for (const edit of EDITS) {
    await knex('achievements').where('key', edit.key).update({ icon_url: edit.to })
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const edit of EDITS) {
    await knex('achievements').where('key', edit.key).update({ icon_url: edit.from })
  }
}
