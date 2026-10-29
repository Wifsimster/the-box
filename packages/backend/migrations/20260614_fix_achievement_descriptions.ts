import type { Knex } from 'knex'

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
