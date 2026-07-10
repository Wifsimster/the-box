import type { Knex } from 'knex'

// Recognition-only GeoGamers achievements. Points feed the existing
// achievement-points leaderboard (that's a recognition tier, not GeoGamers
// season score — no points cross into the season ranking). Awarded on a
// completed RANKED run; see geogamers.routes.
//
// French copy to match the app's default locale (like the other achievement
// seed migrations).

const ACHIEVEMENTS = [
  {
    key: 'geogamers_first_run',
    name: 'GeoGamers : première partie',
    description: 'Terminez votre première partie de GeoGamers',
    category: 'geogamers',
    icon_url: 'crosshair',
    points: 10,
    criteria: JSON.stringify({ type: 'geogamers_runs_completed', count: 1 }),
    tier: 1,
    is_hidden: false,
  },
  {
    key: 'geogamers_perfect_day',
    name: 'GeoGamers : sans-faute',
    description: 'Marquez 200 points sur une partie de GeoGamers',
    category: 'geogamers',
    icon_url: 'target',
    points: 30,
    criteria: JSON.stringify({ type: 'geogamers_perfect_run', score: 200 }),
    tier: 3,
    is_hidden: false,
  },
]

export async function up(knex: Knex): Promise<void> {
  for (const a of ACHIEVEMENTS) {
    // Idempotent: skip if the key already exists (re-run / partial apply safe).
    const exists = await knex('achievements').where({ key: a.key }).first()
    if (!exists) await knex('achievements').insert(a)
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('achievements')
    .whereIn(
      'key',
      ACHIEVEMENTS.map((a) => a.key),
    )
    .del()
}
