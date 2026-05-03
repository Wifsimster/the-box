import type { Knex } from 'knex'

// Adds the user-controlled UI theme column. Free users are pinned to
// `default`; premium users can switch (PUT /api/user/theme is gated by
// `requirePremium` and validates against the catalog there). Stored as
// a free-form short string rather than a Postgres enum so adding a new
// theme is a code-only change — the catalog of valid values lives in
// the frontend `themes.ts` and is mirrored by the backend route.

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('user', 'selected_theme')
  if (!hasColumn) {
    await knex.schema.alterTable('user', (table) => {
      table.string('selected_theme', 32).notNullable().defaultTo('default')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('user', 'selected_theme')
  if (hasColumn) {
    await knex.schema.alterTable('user', (table) => {
      table.dropColumn('selected_theme')
    })
  }
}
