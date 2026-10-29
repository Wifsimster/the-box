import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table
      .string('wikidata_qid', 20)
      .nullable()
      .comment('Wikidata Q-id, e.g. Q3389581 for Elden Ring')
  })

  await knex('geo_ingest_failure').where({ source: 'metadata' }).delete()
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table.dropColumn('wikidata_qid')
  })
}
