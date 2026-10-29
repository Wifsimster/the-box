import { db } from '../database/connection.js'
import { userRepository } from './user.repository.js'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'gdpr' })

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
  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    log.info({ userId }, 'exportUserData')

    const profile = await safe('profile', () => userRepository.findById(userId), null)

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

    const tierSessions = await ifTable(
      'tier_sessions',
      () =>
        db('tier_sessions')
          .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
          .where('game_sessions.user_id', userId)
          .select('tier_sessions.*'),
      [] as unknown[]
    )

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

    const describeGuesses = await ifTable(
      'describe_guess_attempts',
      () =>
        db('describe_guess_attempts')
          .where('user_id', userId)
          .select('id', 'game_session_id', 'position', 'description', 'locale', 'created_at'),
      [] as unknown[]
    )

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
      describeGuesses,
      achievements,
    }
  },
}
