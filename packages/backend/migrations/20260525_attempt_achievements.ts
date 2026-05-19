import type { Knex } from 'knex'

// Attempt-based achievements. Now that every guess is persisted per
// screenshot, we can reward the *journey* of cracking a single capture —
// both stubborn persistence and first-try precision.
//
// Four new criteria types are evaluated per-game from GameCompletionData
// (attempts_in_game, comeback_in_game, first_try_in_game, flawless_game);
// total_wrong_guesses is a cumulative all-time aggregate. The matching
// checker functions live in achievement.service.ts.

export async function up(knex: Knex): Promise<void> {
  const achievements = [
    {
      key: 'acharne',
      name: 'Acharné',
      description: 'Tente ta chance plus de 10 fois sur une seule capture',
      category: 'completion',
      icon_url: '🔁',
      points: 20,
      criteria: { type: 'attempts_in_game', count: 10 },
      tier: 1,
      is_hidden: false,
    },
    {
      key: 'tete_de_mule',
      name: 'Tête de mule',
      description: 'Tente ta chance 20 fois ou plus sur une seule capture',
      category: 'completion',
      icon_url: '🐴',
      points: 50,
      criteria: { type: 'attempts_in_game', count: 20 },
      tier: 2,
      is_hidden: true,
    },
    {
      key: 'jamais_abandonner',
      name: 'Jamais abandonner',
      description: 'Identifie une capture après 8 mauvaises propositions ou plus',
      category: 'completion',
      icon_url: '💪',
      points: 45,
      criteria: { type: 'comeback_in_game', count: 8 },
      tier: 2,
      is_hidden: false,
    },
    {
      key: 'du_premier_coup',
      name: 'Du premier coup',
      description: 'Identifie une capture dès la première proposition',
      category: 'accuracy',
      icon_url: '🎯',
      points: 15,
      criteria: { type: 'first_try_in_game', count: 1 },
      tier: 1,
      is_hidden: false,
    },
    {
      key: 'sans_hesitation',
      name: 'Sans hésitation',
      description: 'Termine un défi sans une seule mauvaise proposition',
      category: 'accuracy',
      icon_url: '✨',
      points: 100,
      criteria: { type: 'flawless_game', count: 10 },
      tier: 3,
      is_hidden: false,
    },
    {
      key: 'tatonneur',
      name: 'Tâtonneur',
      description: 'Accumule 100 mauvaises propositions au total',
      category: 'completion',
      icon_url: '🧭',
      points: 25,
      criteria: { type: 'total_wrong_guesses', count: 100 },
      tier: 1,
      is_hidden: false,
    },
    {
      key: 'increvable',
      name: 'Increvable',
      description: 'Accumule 1 000 mauvaises propositions au total',
      category: 'completion',
      icon_url: '🛡️',
      points: 150,
      criteria: { type: 'total_wrong_guesses', count: 1000 },
      tier: 3,
      is_hidden: true,
    },
  ]

  // Idempotent: skip keys that already exist so the migration is safe to
  // re-run in seeded test environments (mirrors 20260512_mastery_milestones).
  const existing = await knex<{ key: string }>('achievements')
    .whereIn(
      'key',
      achievements.map((a) => a.key)
    )
    .select('key')
  const existingKeys = new Set(existing.map((r) => r.key))
  const toInsert = achievements.filter((a) => !existingKeys.has(a.key))

  if (toInsert.length === 0) return

  await knex('achievements').insert(
    toInsert.map((a) => ({
      ...a,
      criteria: JSON.stringify(a.criteria),
    }))
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex('achievements')
    .whereIn('key', [
      'acharne',
      'tete_de_mule',
      'jamais_abandonner',
      'du_premier_coup',
      'sans_hesitation',
      'tatonneur',
      'increvable',
    ])
    .del()
}
