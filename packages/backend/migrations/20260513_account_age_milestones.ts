import type { Knex } from 'knex'

// Long-tail mastery milestones that require new criteria_type handlers
// in achievement.service:
//   - `perfect_score_count`: cumulative count of perfect (2000-pt) sessions
//   - `account_age_days`:    days since `users."createdAt"`
//
// Account-age milestones do NOT trigger from a game completion — they
// fire from a daily BullMQ worker that scans active users. Sphinx
// triggers naturally post-game-completion via the existing checker
// pipeline.

export async function up(knex: Knex): Promise<void> {
  const milestones = [
    {
      key: 'sphinx',
      name: 'Sphinx',
      description: '50 sessions terminées avec un score parfait de 2000 points',
      category: 'mastery',
      icon_url: '🦁',
      points: 250,
      criteria: { type: 'perfect_score_count', count: 50 },
      tier: 3,
      is_hidden: true,
    },
    {
      key: 'un_an_avec_nous',
      name: 'Un an avec nous',
      description: 'Une année entière depuis ton inscription',
      category: 'mastery',
      icon_url: '🎂',
      points: 300,
      criteria: { type: 'account_age_days', days: 365 },
      tier: 3,
      is_hidden: true,
    },
    {
      key: 'deux_ans_avec_nous',
      name: 'Deux ans avec nous',
      description: 'Deux années entières depuis ton inscription',
      category: 'mastery',
      icon_url: '🏆',
      points: 500,
      criteria: { type: 'account_age_days', days: 730 },
      tier: 3,
      is_hidden: true,
    },
  ]

  const existing = await knex<{ key: string }>('achievements')
    .whereIn('key', milestones.map((m) => m.key))
    .select('key')
  const existingKeys = new Set(existing.map((r) => r.key))
  const toInsert = milestones.filter((m) => !existingKeys.has(m.key))
  if (toInsert.length === 0) return

  await knex('achievements').insert(
    toInsert.map((m) => ({
      ...m,
      criteria: JSON.stringify(m.criteria),
    }))
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex('achievements')
    .whereIn('key', ['sphinx', 'un_an_avec_nous', 'deux_ans_avec_nous'])
    .del()
}
