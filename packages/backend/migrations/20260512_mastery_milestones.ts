import type { Knex } from 'knex'

// Mastery-tier milestones — long-tail markers that fire over months/years
// of play. They reuse the existing achievement evaluator (no new
// criteria_type required) and only fill GAPS in the existing threshold
// curve. Pre-existing thresholds already cover:
//   challenges_completed: 1, 5, 10, 25, 50, 100
//   total_correct_guesses: 1, 10, 50, 100
//   total_guesses:        1, 100, 500
// The five milestones below extend the curve at 200+ defi, 250/500
// correct, and 1000 total guesses — purely additive value.
//
// Three Sphinx-class milestones (perfect_score_count, account_age_days)
// require new criteria types and a daily worker; they are deliberately
// deferred to a follow-up step so this migration stays seed-only and
// ships zero code changes to the achievement evaluator.

export async function up(knex: Knex): Promise<void> {
  // Idempotent: skip rows whose key already exists. Lets us re-run the
  // migration in seeded test envs without ON CONFLICT noise.
  const milestones = [
    {
      key: 'mille_fois',
      name: 'Mille fois',
      description: 'Soumets 1 000 propositions au total',
      category: 'mastery',
      icon_url: '🏛️',
      points: 150,
      criteria: { type: 'total_guesses', count: 1000 },
      tier: 3,
      is_hidden: false,
    },
    {
      key: 'encyclopedie_vivante_ii',
      name: 'Encyclopédie vivante II',
      description: 'Identifie 250 jeux avec succès',
      category: 'mastery',
      icon_url: '📚',
      points: 100,
      criteria: { type: 'total_correct_guesses', count: 250 },
      tier: 3,
      is_hidden: false,
    },
    {
      key: 'maitre_des_jeux',
      name: 'Maître des jeux',
      description: 'Identifie 500 jeux avec succès',
      category: 'mastery',
      icon_url: '👑',
      points: 200,
      criteria: { type: 'total_correct_guesses', count: 500 },
      tier: 3,
      is_hidden: true,
    },
    {
      key: 'deux_cents_defis',
      name: 'Deux cents défis',
      description: 'Termine 200 défis quotidiens',
      category: 'mastery',
      icon_url: '🎖️',
      points: 250,
      criteria: { type: 'challenges_completed', count: 200 },
      tier: 3,
      is_hidden: true,
    },
    {
      key: 'annee_de_defis',
      name: 'Année de défis',
      description: 'Termine 365 défis quotidiens — l\'équivalent d\'une année',
      category: 'mastery',
      icon_url: '🗓️',
      points: 400,
      criteria: { type: 'challenges_completed', count: 365 },
      tier: 3,
      is_hidden: true,
    },
  ]

  // Filter out keys already seeded — keeps the migration safe to re-run
  // and avoids unique-key collisions in environments where some of these
  // names happen to pre-exist via seed scripts.
  const existing = await knex<{ key: string }>('achievements')
    .whereIn(
      'key',
      milestones.map((m) => m.key)
    )
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
    .whereIn('key', [
      'mille_fois',
      'encyclopedie_vivante_ii',
      'maitre_des_jeux',
      'deux_cents_defis',
      'annee_de_defis',
    ])
    .del()
}
