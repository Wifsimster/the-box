import type { Knex } from 'knex';

/**
 * Stub migration - tournaments feature was removed.
 * This file exists only to satisfy Knex migration history validation.
 * The actual tables were removed in a subsequent migration.
 */

export async function up(_knex: Knex): Promise<void> {
  // No-op: feature removed
}

export async function down(_knex: Knex): Promise<void> {
  // No-op: feature removed
}
