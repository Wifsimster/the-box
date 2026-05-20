import type { Knex } from 'knex'

/**
 * Adds Better Auth twoFactor + passkey plugin tables.
 *
 * Naming matches Better Auth's plugin defaults (camelCase model + field names,
 * quoted in Postgres) so the plugins work with their default schema config —
 * no `schema:` overrides required in `auth.ts`.
 */
export async function up(knex: Knex): Promise<void> {
    // --- twoFactor plugin ---
    // Adds twoFactorEnabled flag to the user table.
    await knex.raw(`
        ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false
    `)

    // Per-user TOTP secret + backup codes. One row per enrolled user.
    // Better Auth queries this table by model name "twoFactor" (camelCase, quoted).
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS "twoFactor" (
            "id" TEXT PRIMARY KEY,
            "secret" TEXT NOT NULL,
            "backupCodes" TEXT NOT NULL,
            "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
        )
    `)
    await knex.raw('CREATE INDEX IF NOT EXISTS "twoFactor_userId_idx" ON "twoFactor" ("userId")')
    await knex.raw('CREATE INDEX IF NOT EXISTS "twoFactor_secret_idx" ON "twoFactor" ("secret")')

    // --- passkey plugin ---
    // One row per registered WebAuthn credential (a user can have several:
    // Touch ID on laptop + Face ID on phone + a hardware FIDO2 key).
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS "passkey" (
            "id" TEXT PRIMARY KEY,
            "name" TEXT,
            "publicKey" TEXT NOT NULL,
            "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
            "credentialID" TEXT NOT NULL,
            "counter" INTEGER NOT NULL,
            "deviceType" TEXT NOT NULL,
            "backedUp" BOOLEAN NOT NULL,
            "transports" TEXT,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "aaguid" TEXT
        )
    `)
    await knex.raw('CREATE INDEX IF NOT EXISTS "passkey_userId_idx" ON "passkey" ("userId")')
    await knex.raw('CREATE INDEX IF NOT EXISTS "passkey_credentialID_idx" ON "passkey" ("credentialID")')
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP TABLE IF EXISTS "passkey"')
    await knex.raw('DROP TABLE IF EXISTS "twoFactor"')
    await knex.raw('ALTER TABLE "user" DROP COLUMN IF EXISTS "twoFactorEnabled"')
}
