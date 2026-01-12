import type { Knex } from 'knex'

/**
 * Fix emailVerified column type from text to boolean.
 * better-auth expects a boolean type for this field.
 */
export async function up(knex: Knex): Promise<void> {
    // Drop the users view that depends on the user table
    await knex.raw('DROP VIEW IF EXISTS users')

    // Use ALTER COLUMN to convert type directly (more efficient)
    await knex.raw(`
        ALTER TABLE "user"
        ALTER COLUMN "emailVerified" DROP DEFAULT,
        ALTER COLUMN "emailVerified" TYPE boolean USING (
            CASE
                WHEN "emailVerified" = 'true' THEN true
                ELSE false
            END
        ),
        ALTER COLUMN "emailVerified" SET DEFAULT false
    `)

    // Recreate the users view
    await knex.raw('CREATE VIEW users AS SELECT * FROM "user"')
}

export async function down(knex: Knex): Promise<void> {
    // Drop the users view that depends on the user table
    await knex.raw('DROP VIEW IF EXISTS users')

    // Revert: convert boolean back to text
    await knex.raw(`
        ALTER TABLE "user"
        ALTER COLUMN "emailVerified" DROP DEFAULT,
        ALTER COLUMN "emailVerified" TYPE text USING (
            CASE
                WHEN "emailVerified" = true THEN 'true'
                ELSE 'false'
            END
        ),
        ALTER COLUMN "emailVerified" SET DEFAULT 'false'
    `)

    // Recreate the users view
    await knex.raw('CREATE VIEW users AS SELECT * FROM "user"')
}
