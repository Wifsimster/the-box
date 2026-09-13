import type { Knex } from 'knex'

// The GeoGamers achievements shipped with Lucide icon *names* in `icon_url`
// ('crosshair', 'target') while every other achievement stores an emoji.
// `icon_url` is rendered as raw text by the UI (AchievementCard,
// HomeAchievementTeaser, AchievementNotification), so those two rows showed
// the literal word "crosshair" / "target" where the badge should be.
// Swap them for emoji in line with the rest of the catalogue.

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
