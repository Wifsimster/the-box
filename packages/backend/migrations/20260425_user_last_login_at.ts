import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP WITH TIME ZONE
  `)

  await knex.raw(`
    UPDATE "user" u
    SET "lastLoginAt" = s.max_created
    FROM (
      SELECT "userId" AS user_id, MAX("createdAt") AS max_created
      FROM session
      GROUP BY "userId"
    ) s
    WHERE u.id = s.user_id
  `)

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_user_last_login_at ON "user"("lastLoginAt")')
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_user_last_login_at')
  await knex.raw('ALTER TABLE "user" DROP COLUMN IF EXISTS "lastLoginAt"')
}
