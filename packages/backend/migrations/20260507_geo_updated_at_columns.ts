import type { Knex } from 'knex'

const TABLES_NEEDING_UPDATED_AT = [
  'geo_map',
  'geo_screenshot_candidate',
  'geo_screenshot_meta',
  'geo_challenge',
  'geo_guess',
  'geo_pin_submission',
] as const

export async function up(knex: Knex): Promise<void> {
  for (const table of TABLES_NEEDING_UPDATED_AT) {
    const exists = await knex.schema.hasColumn(table, 'updated_at')
    if (exists) continue
    await knex.schema.alterTable(table, (t) => {
      t.timestamp('updated_at', { useTz: true })
    })
    const hasCreatedAt = await knex.schema.hasColumn(table, 'created_at')
    if (hasCreatedAt) {
      await knex.raw(
        `UPDATE ?? SET updated_at = COALESCE(created_at, NOW()) WHERE updated_at IS NULL`,
        [table],
      )
    } else {
      await knex.raw(`UPDATE ?? SET updated_at = NOW() WHERE updated_at IS NULL`, [table])
    }
    await knex.schema.alterTable(table, (t) => {
      t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now()).alter()
    })
  }

  const hasAttemptedAtIdx = await knex.schema
    .hasTable('geo_ingest_attempt')
    .then(async (exists) =>
      exists
        ? (await knex.raw(
            `SELECT 1 FROM pg_indexes WHERE indexname = 'geo_ingest_attempt_attempted_at_idx'`,
          )).rows.length > 0
        : true,
    )
  if (!hasAttemptedAtIdx) {
    await knex.schema.alterTable('geo_ingest_attempt', (t) => {
      t.index('attempted_at', 'geo_ingest_attempt_attempted_at_idx')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasIdx = await knex.raw(
    `SELECT 1 FROM pg_indexes WHERE indexname = 'geo_ingest_attempt_attempted_at_idx'`,
  )
  if (hasIdx.rows.length > 0) {
    await knex.schema.alterTable('geo_ingest_attempt', (t) => {
      t.dropIndex('attempted_at', 'geo_ingest_attempt_attempted_at_idx')
    })
  }
  for (const table of TABLES_NEEDING_UPDATED_AT) {
    const exists = await knex.schema.hasColumn(table, 'updated_at')
    if (!exists) continue
    await knex.schema.alterTable(table, (t) => {
      t.dropColumn('updated_at')
    })
  }
}
