/**
 * Public streamer profile port.
 *
 * Backs the key-authenticated public API (`/api/public/v1`), which exposes a
 * deliberately narrow, opt-in view of a player: only users who set
 * `public_profile_enabled` and claimed a slug appear at all.
 *
 * Extracted from `public.routes.ts`, which reached straight into Knex — and
 * repeated the same "resolve these user ids to public slugs" query in three
 * separate handlers.
 */
import type { Counter } from './analytics.js'

/** The opted-in fields of a public streamer. Never includes email or id-in-output. */
export interface PublicStreamerRecord {
  id: string
  public_slug: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  current_streak: number
  longest_streak: number
  total_score: number
}

/** A streamer's session for one daily challenge. */
export interface PublicDailySessionRecord {
  id: string
  total_score: number
  current_tier: number
  is_completed: boolean
  started_at: Date
  completed_at: Date | null
}

export interface PublicProfileRepository {
  /** Opted-in streamer for a slug, or null when the slug is unknown or opted out. */
  findBySlug(slug: string): Promise<PublicStreamerRecord | null>

  /** Completed, non-catch-up dailies — the "games played" figure. */
  countRankedSessions(userId: string): Promise<Counter>

  /** The streamer's non-catch-up session for a challenge, if they started it. */
  findDailySession(
    userId: string,
    challengeId: number
  ): Promise<PublicDailySessionRecord | null>

  /** Correct answers summed across a session's tiers. */
  countCorrectAnswers(gameSessionId: string): Promise<Counter>

  /**
   * Public slugs for the given user ids, opted-in only. Used to decorate
   * leaderboard rows — a user without a slug is simply absent from the map
   * and the caller falls back to their display name.
   */
  findPublicSlugs(userIds: string[]): Promise<Map<string, string | null>>
}
