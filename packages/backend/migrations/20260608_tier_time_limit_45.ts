import type { Knex } from 'knex'

// Bump the per-screenshot countdown limit from 30s to 45s.
//
// The `tiers.time_limit_seconds` column existed since the merged schema but was
// never surfaced to the client or enforced. The new in-game countdown timer
// reads it (exposed via ScreenshotResponse.timeLimitSeconds). The product value
// is 45s, so we move the column default and bump existing tiers that still sit
// on the old 30s default. Tiers with a custom value are left untouched.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE tiers ALTER COLUMN time_limit_seconds SET DEFAULT 45')
  await knex('tiers').where('time_limit_seconds', 30).update({ time_limit_seconds: 45 })
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE tiers ALTER COLUMN time_limit_seconds SET DEFAULT 30')
  // Data is intentionally not reverted: 45 is a valid value and we can't tell
  // which rows we bumped from a row that was always 45.
}
