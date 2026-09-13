/**
 * Public streamer profile repository.
 *
 * Every query is scoped to `public_profile_enabled = true`. That predicate is
 * the opt-in gate for the whole public API, so it lives here — in one place,
 * on every read — rather than being re-stated by each caller.
 */
import { db } from '../database/connection.js'
import type { Counter } from '../../domain/ports/analytics.js'
import type {
  PublicDailySessionRecord,
  PublicProfileRepository,
  PublicStreamerRecord,
} from '../../domain/ports/public-profile.js'

export const publicProfileRepository: PublicProfileRepository = {
  async findBySlug(slug: string): Promise<PublicStreamerRecord | null> {
    const row = await db('user')
      .where('public_slug', slug)
      .andWhere('public_profile_enabled', true)
      .select<PublicStreamerRecord>(
        'id',
        'public_slug',
        'display_name',
        'username',
        'avatar_url',
        'current_streak',
        'longest_streak',
        'total_score',
      )
      .first()
    return row ?? null
  },

  async countRankedSessions(userId: string): Promise<Counter> {
    const row = await db('game_sessions')
      .where('user_id', userId)
      .andWhere('is_completed', true)
      .andWhere('is_catch_up', false)
      .count<{ count: string }[]>('id as count')
      .first()
    return row?.count ?? 0
  },

  async findDailySession(
    userId: string,
    challengeId: number,
  ): Promise<PublicDailySessionRecord | null> {
    const row = await db('game_sessions')
      .where('user_id', userId)
      .andWhere('daily_challenge_id', challengeId)
      .andWhere('is_catch_up', false)
      .select<PublicDailySessionRecord>(
        'id',
        'total_score',
        'current_tier',
        'is_completed',
        'started_at',
        'completed_at',
      )
      .first()
    return row ?? null
  },

  async countCorrectAnswers(gameSessionId: string): Promise<Counter> {
    const row = await db('tier_sessions')
      .where('game_session_id', gameSessionId)
      .sum<{ sum: string | null }[]>('correct_answers as sum')
      .first()
    return row?.sum ?? 0
  },

  async findPublicSlugs(userIds: string[]): Promise<Map<string, string | null>> {
    if (userIds.length === 0) return new Map()

    const rows = await db('user')
      .whereIn('id', userIds)
      .andWhere('public_profile_enabled', true)
      .select<Array<{ id: string; public_slug: string | null }>>('id', 'public_slug')

    return new Map(rows.map((row) => [row.id, row.public_slug]))
  },
}
