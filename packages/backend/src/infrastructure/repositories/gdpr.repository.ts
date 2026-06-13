import { db } from '../database/connection.js'
import { userRepository } from './user.repository.js'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'gdpr' })

/**
 * GDPR / RGPD data-export repository (Art. 15 access + Art. 20 portability).
 *
 * Aggregates everything the platform holds about a single user into a plain
 * JSON object suitable for a one-click download. Two hard rules govern what
 * lands in the file:
 *
 *  1. Data minimisation / secret hygiene — NEVER emit secret material. Push
 *     keys (`p256dh`, `auth`), API-key hashes (`key_hash`), webhook secrets
 *     (`secret_hash`, `secret_prefix`, `secret_enc`) and the auth `account`
 *     credentials (`password`, `accessToken`, `refreshToken`) are explicitly
 *     excluded by selecting only the safe columns.
 *
 *  2. Defensive degradation — every optional table is guarded with
 *     `hasTable` so an env that never ran a given migration can't 500 the
 *     whole export, and each section is wrapped so a partial failure leaves
 *     the rest of the export intact rather than aborting it.
 */

// Run a per-section query, returning `[]` (or the supplied fallback) instead
// of throwing so one bad table can't sink the entire export.
async function safe<T>(
  section: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    log.warn({ section, error: String(error) }, 'gdpr export section failed; degrading gracefully')
    return fallback
  }
}

// Only query a table that actually exists in this environment.
async function ifTable<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  return safe(name, async () => {
    const exists = await db.schema.hasTable(name)
    if (!exists) return fallback
    return fn()
  }, fallback)
}

export const gdprRepository = {
  /**
   * Build the full export object for `userId`. Returns a plain
   * `Record<string, unknown>` — the route serialises it as a file download.
   */
  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    log.info({ userId }, 'exportUserData')

    const profile = await safe('profile', () => userRepository.findById(userId), null)

    // Better Auth account rows — exclude credential material.
    const accounts = await ifTable(
      'account',
      () =>
        db('account')
          .where('userId', userId)
          .select(
            'id',
            'providerId',
            'accountId',
            'scope',
            'createdAt',
            'updatedAt'
          ),
      [] as unknown[]
    )

    // Active sessions — no token bytes, just the device/timing metadata.
    const sessions = await ifTable(
      'session',
      () =>
        db('session')
          .where('userId', userId)
          .select(
            'id',
            'expiresAt',
            'ipAddress',
            'userAgent',
            'createdAt',
            'updatedAt'
          ),
      [] as unknown[]
    )

    const gameSessions = await ifTable(
      'game_sessions',
      () => db('game_sessions').where('user_id', userId).select('*'),
      [] as unknown[]
    )

    // Tier sessions are nested under the user's game sessions.
    const tierSessions = await ifTable(
      'tier_sessions',
      () =>
        db('tier_sessions')
          .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
          .where('game_sessions.user_id', userId)
          .select('tier_sessions.*'),
      [] as unknown[]
    )

    // Guesses join through tier_sessions → game_sessions to scope to the user.
    const guesses = await ifTable(
      'guesses',
      () =>
        db('guesses')
          .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
          .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
          .where('game_sessions.user_id', userId)
          .select('guesses.*'),
      [] as unknown[]
    )

    const inventory = await ifTable(
      'user_inventory',
      () => db('user_inventory').where('user_id', userId).select('*'),
      [] as unknown[]
    )

    const loginStreaks = await ifTable(
      'user_login_streaks',
      () => db('user_login_streaks').where('user_id', userId).select('*'),
      [] as unknown[]
    )

    const loginRewardClaims = await ifTable(
      'login_reward_claims',
      () => db('login_reward_claims').where('user_id', userId).select('*'),
      [] as unknown[]
    )

    const rewardGrants = await ifTable(
      'reward_grants',
      () => db('reward_grants').where('user_id', userId).select('*'),
      [] as unknown[]
    )

    // Push subscriptions — endpoint + UA only. EXCLUDE p256dh / auth.
    const pushSubscriptions = await ifTable(
      'push_subscriptions',
      () =>
        db('push_subscriptions')
          .where('user_id', userId)
          .select(
            'id',
            'endpoint',
            'user_agent',
            'is_active',
            'created_at',
            'last_success_at',
            'last_failure_at'
          ),
      [] as unknown[]
    )

    const subscriptions = await ifTable(
      'subscriptions',
      () => db('subscriptions').where('user_id', userId).select('*'),
      [] as unknown[]
    )

    // Geo crowdsource pins.
    const geoPinSubmissions = await ifTable(
      'geo_pin_submission',
      () => db('geo_pin_submission').where('user_id', userId).select('*'),
      [] as unknown[]
    )

    const geoGuesses = await ifTable(
      'geo_guess',
      () => db('geo_guess').where('user_id', userId).select('*'),
      [] as unknown[]
    )

    const geoContributorStats = await ifTable(
      'geo_contributor_stats',
      () => db('geo_contributor_stats').where('user_id', userId).first(),
      null
    )

    // API keys — label/prefix/scopes only. EXCLUDE key_hash.
    const apiKeys = await ifTable(
      'api_keys',
      () =>
        db('api_keys')
          .where('user_id', userId)
          .select(
            'id',
            'label',
            'key_prefix',
            'scopes',
            'mode',
            'is_active',
            'created_at',
            'last_used_at',
            'revoked_at'
          ),
      [] as unknown[]
    )

    // Webhooks — label/url/events only. EXCLUDE secret_hash/secret_prefix/secret_enc.
    const webhooks = await ifTable(
      'webhooks',
      () =>
        db('webhooks')
          .where('user_id', userId)
          .select(
            'id',
            'label',
            'url',
            'events',
            'is_active',
            'created_at',
            'last_delivered_at',
            'revoked_at'
          ),
      [] as unknown[]
    )

    // Email send history for this user (no body is stored anywhere).
    const emailLog = await ifTable(
      'email_log',
      () =>
        db('email_log')
          .where('user_id', userId)
          .select(
            'id',
            'recipient',
            'type',
            'subject',
            'status',
            'sent_at'
          ),
      [] as unknown[]
    )

    // Achievements, joined to their definitions so the export is readable.
    const achievements = await ifTable(
      'user_achievements',
      () =>
        db('user_achievements')
          .leftJoin('achievements', 'user_achievements.achievement_id', 'achievements.id')
          .where('user_achievements.user_id', userId)
          .select(
            'user_achievements.achievement_id',
            'achievements.key as achievement_key',
            'achievements.name as achievement_name',
            'user_achievements.earned_at',
            'user_achievements.progress',
            'user_achievements.progress_max',
            'user_achievements.metadata'
          ),
      [] as unknown[]
    )

    return {
      exportedAt: new Date().toISOString(),
      profile,
      accounts,
      sessions,
      gameSessions,
      tierSessions,
      guesses,
      inventory,
      loginStreaks,
      loginRewardClaims,
      rewardGrants,
      pushSubscriptions,
      subscriptions,
      geoPinSubmissions,
      geoGuesses,
      geoContributorStats,
      apiKeys,
      webhooks,
      emailLog,
      achievements,
    }
  },
}
