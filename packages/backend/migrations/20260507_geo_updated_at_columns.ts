import type { Knex } from 'knex'

// Forensics enabler: every geo write-heavy table now has `updated_at` so
// the audit log can be cross-referenced with row-level last-touched
// timestamps. Defaults to `created_at` (or NOW() where created_at doesn't
// exist) so existing rows aren't NULL.
//
// We deliberately DO NOT add a database trigger to keep these in sync —
// the app already mutates these tables through repositories, so the
// repositories own the bump. A trigger would silently mask bugs where
// a write path forgets to refresh updated_at.

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
    // Backfill from created_at where present, else NOW(). Done as raw SQL
    // because Knex.js' schema.alterTable doesn't support per-column
    // backfill expressions cleanly.
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

  // Retention helper: a single index on `attempted_at` enables a cheap
  // `DELETE WHERE attempted_at < NOW() - INTERVAL '90 days'` retention
  // sweep on `geo_ingest_attempt` (currently unbounded growth ~150k/day
  // at projected catalog volume). The index is created here so the
  // retention worker added in a follow-up commit lands cheap.
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
  // Drop the retention index first; the column drop on its own is safe.
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
