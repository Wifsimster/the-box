import type { Knex } from 'knex'

// Align achievement descriptions with what the evaluator actually rewards.
// No criteria/threshold changes — wording only — so already-earned rows stay
// valid. Three classes of mismatch were corrected:
//
//   1. game_collector_10/50/100 advertised "<n> jeux différents" (distinct
//      games) but the criteria is `total_correct_guesses` — a cumulative
//      count of correct guesses that does NOT de-duplicate by game. Reworded
//      to "<n> bonnes réponses au total".
//   2. high_roller said "plus de 1800 points" (strictly more than) but
//      `min_score` fires at score >= 1800, so 1800 itself qualifies.
//   3. acharne said "plus de 10 fois" (strictly more than) but
//      `attempts_in_game` fires at attempts >= 10. Brought in line with its
//      sibling tete_de_mule, which already reads "20 fois ou plus".

interface DescriptionEdit {
  key: string
  to: string
  from: string
}

const EDITS: DescriptionEdit[] = [
  {
    key: 'game_collector_10',
    from: 'Identifiez correctement 10 jeux différents',
    to: 'Trouvez 10 bonnes réponses au total',
  },
  {
    key: 'game_collector_50',
    from: 'Identifiez correctement 50 jeux différents',
    to: 'Trouvez 50 bonnes réponses au total',
  },
  {
    key: 'game_collector_100',
    from: 'Identifiez correctement 100 jeux différents',
    to: 'Trouvez 100 bonnes réponses au total',
  },
  {
    key: 'high_roller',
    from: 'Obtenez plus de 1800 points dans un seul défi',
    to: 'Obtenez au moins 1800 points dans un seul défi',
  },
  {
    key: 'acharne',
    from: 'Tente ta chance plus de 10 fois sur une seule capture',
    to: 'Tente ta chance 10 fois ou plus sur une seule capture',
  },
]

export async function up(knex: Knex): Promise<void> {
  for (const edit of EDITS) {
    await knex('achievements').where('key', edit.key).update({ description: edit.to })
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const edit of EDITS) {
    await knex('achievements').where('key', edit.key).update({ description: edit.from })
  }
}
