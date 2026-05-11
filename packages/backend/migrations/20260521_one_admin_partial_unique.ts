import type { Knex } from 'knex'

// Closes the first-user-admin bootstrap race. The auth hook does
// `SELECT COUNT(*) == 0 -> insert with role=admin`, which is not
// serialisable. Two simultaneous sign-ups on a fresh DB can both observe
// zero and both insert with admin role.
//
// This partial unique index guarantees at most one user row may carry
// role='admin'. The second writer in the race trips a unique-violation
// and falls back to the default role; the application hook treats that
// rollback path as "I'm not the first user, please continue."
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS one_admin_role_idx
    ON "user"((role))
    WHERE role = 'admin'
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS one_admin_role_idx')
}
