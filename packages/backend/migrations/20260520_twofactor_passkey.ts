import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false
    `)

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
