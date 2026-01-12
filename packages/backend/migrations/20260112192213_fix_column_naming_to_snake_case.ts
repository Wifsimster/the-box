import type { Knex } from "knex";

/**
 * Rename camelCase columns to snake_case for Better Auth compatibility.
 * PostgreSQL with Better Auth expects snake_case column names by default.
 */
export async function up(knex: Knex): Promise<void> {
    // Drop the users view first (depends on user table)
    await knex.raw('DROP VIEW IF EXISTS users')

    // Rename columns in user table
    await knex.schema.alterTable('user', (table) => {
        table.renameColumn('emailVerified', 'email_verified')
        table.renameColumn('createdAt', 'created_at')
        table.renameColumn('updatedAt', 'updated_at')
        table.renameColumn('displayUsername', 'display_username')
        table.renameColumn('usernameUpdatedAt', 'username_updated_at')
        table.renameColumn('banReason', 'ban_reason')
        table.renameColumn('banExpires', 'ban_expires')
        table.renameColumn('displayName', 'display_name')
        table.renameColumn('avatarUrl', 'avatar_url')
        table.renameColumn('totalScore', 'total_score')
        table.renameColumn('currentStreak', 'current_streak')
        table.renameColumn('longestStreak', 'longest_streak')
        table.renameColumn('lastPlayedAt', 'last_played_at')
        table.renameColumn('isAnonymous', 'is_anonymous')
    })

    // Rename columns in session table
    await knex.schema.alterTable('session', (table) => {
        table.renameColumn('expiresAt', 'expires_at')
        table.renameColumn('createdAt', 'created_at')
        table.renameColumn('updatedAt', 'updated_at')
        table.renameColumn('ipAddress', 'ip_address')
        table.renameColumn('userAgent', 'user_agent')
        table.renameColumn('userId', 'user_id')
        table.renameColumn('anonymousId', 'anonymous_id')
    })

    // Rename columns in account table
    await knex.schema.alterTable('account', (table) => {
        table.renameColumn('accountId', 'account_id')
        table.renameColumn('providerId', 'provider_id')
        table.renameColumn('userId', 'user_id')
        table.renameColumn('accessToken', 'access_token')
        table.renameColumn('refreshToken', 'refresh_token')
        table.renameColumn('accessTokenExpiresAt', 'access_token_expires_at')
        table.renameColumn('refreshTokenExpiresAt', 'refresh_token_expires_at')
        table.renameColumn('createdAt', 'created_at')
        table.renameColumn('updatedAt', 'updated_at')
    })

    // Rename columns in verification table
    await knex.schema.alterTable('verification', (table) => {
        table.renameColumn('expiresAt', 'expires_at')
        table.renameColumn('createdAt', 'created_at')
        table.renameColumn('updatedAt', 'updated_at')
    })

    // Recreate the users view with the new column names
    await knex.raw('CREATE VIEW users AS SELECT * FROM "user"')
}


export async function down(knex: Knex): Promise<void> {
    // Drop the users view first
    await knex.raw('DROP VIEW IF EXISTS users')

    // Revert column names in verification table
    await knex.schema.alterTable('verification', (table) => {
        table.renameColumn('expires_at', 'expiresAt')
        table.renameColumn('created_at', 'createdAt')
        table.renameColumn('updated_at', 'updatedAt')
    })

    // Revert column names in account table
    await knex.schema.alterTable('account', (table) => {
        table.renameColumn('account_id', 'accountId')
        table.renameColumn('provider_id', 'providerId')
        table.renameColumn('user_id', 'userId')
        table.renameColumn('access_token', 'accessToken')
        table.renameColumn('refresh_token', 'refreshToken')
        table.renameColumn('access_token_expires_at', 'accessTokenExpiresAt')
        table.renameColumn('refresh_token_expires_at', 'refreshTokenExpiresAt')
        table.renameColumn('created_at', 'createdAt')
        table.renameColumn('updated_at', 'updatedAt')
    })

    // Revert column names in session table
    await knex.schema.alterTable('session', (table) => {
        table.renameColumn('expires_at', 'expiresAt')
        table.renameColumn('created_at', 'createdAt')
        table.renameColumn('updated_at', 'updatedAt')
        table.renameColumn('ip_address', 'ipAddress')
        table.renameColumn('user_agent', 'userAgent')
        table.renameColumn('user_id', 'userId')
        table.renameColumn('anonymous_id', 'anonymousId')
    })

    // Revert column names in user table
    await knex.schema.alterTable('user', (table) => {
        table.renameColumn('email_verified', 'emailVerified')
        table.renameColumn('created_at', 'createdAt')
        table.renameColumn('updated_at', 'updatedAt')
        table.renameColumn('display_username', 'displayUsername')
        table.renameColumn('username_updated_at', 'usernameUpdatedAt')
        table.renameColumn('ban_reason', 'banReason')
        table.renameColumn('ban_expires', 'banExpires')
        table.renameColumn('display_name', 'displayName')
        table.renameColumn('avatar_url', 'avatarUrl')
        table.renameColumn('total_score', 'totalScore')
        table.renameColumn('current_streak', 'currentStreak')
        table.renameColumn('longest_streak', 'longestStreak')
        table.renameColumn('last_played_at', 'lastPlayedAt')
        table.renameColumn('is_anonymous', 'isAnonymous')
    })

    // Recreate the users view
    await knex.raw('CREATE VIEW users AS SELECT * FROM "user"')
}


