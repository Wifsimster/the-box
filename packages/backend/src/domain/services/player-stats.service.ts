/**
 * Advanced player statistics.
 *
 * Pure shaping of the aggregates behind the premium profile panel. Kept out
 * of the route so the rounding and null-handling rules are testable without
 * a database, and out of the repository so the SQL has one job.
 */
import type { AdvancedStats, PublicProfile, User } from '@the-box/types'
import type { LogWriter } from '../ports/logger.js'
import type {
  AdvancedStatsAggregates,
  PlayerStatsRepository,
  PublicProfileAggregates,
} from '../ports/player-stats.js'
import type { Counter } from '../ports/analytics.js'

/** Calendar months of progression the panel charts, including this one. */
export const ADVANCED_STATS_MONTHS = 6

/** Finished dailies listed on a public profile. */
export const PUBLIC_PROFILE_RECENT_SESSIONS = 5

function count(value: Counter): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function rounded(value: Counter): number {
  return Math.round(count(value))
}

/**
 * The streak fields, as the user record actually carries them — both are
 * optional there, and a user who has never played has neither.
 */
export interface PlayerStreakSnapshot {
  currentStreak?: number | undefined
  longestStreak?: number | undefined
}

/**
 * Assemble the advanced-stats payload.
 *
 * Every aggregate is optional at the source — a brand-new premium user has
 * completed no sessions, so Postgres returns nulls for the percentiles and
 * no monthly rows at all. Each is coerced to 0 rather than propagating null,
 * because the panel renders numbers.
 */
export function buildAdvancedStats(
  aggregates: AdvancedStatsAggregates,
  streaks: PlayerStreakSnapshot
): AdvancedStats {
  return {
    bestScore: count(aggregates.scores?.best),
    averageScore: rounded(aggregates.scores?.avg),
    totalCompletedSessions: count(aggregates.scores?.total),
    perfectSessions: count(aggregates.scores?.perfect),
    solveTimeMs: {
      p25: rounded(aggregates.solveTimes?.p25),
      median: rounded(aggregates.solveTimes?.median),
      p75: rounded(aggregates.solveTimes?.p75),
      mean: rounded(aggregates.solveTimes?.mean),
    },
    hintUsage: {
      hintLetter: count(aggregates.hintUsage.lettersRevealed),
      legacyMetadataHints: count(aggregates.hintUsage.legacyMetadataHints),
    },
    monthlyScores: aggregates.monthlyScores.map((row) => ({
      month: row.month,
      totalScore: count(row.total),
      sessionCount: count(row.sessions),
    })),
    streaks: {
      current: streaks.currentStreak ?? 0,
      longest: streaks.longestStreak ?? 0,
    },
  }
}

/**
 * The user fields a public profile renders — a structural subset of `User`,
 * so the caller can pass the record it already fetched. Nothing sensitive
 * appears here: no email, no id in the output, and deliberately no session
 * id (it would let a visitor pivot to today's answers).
 */
export type PublicProfileIdentity = Pick<
  User,
  'username' | 'displayName' | 'avatarUrl' | 'createdAt' | 'totalScore' | 'currentStreak' | 'longestStreak'
>

/**
 * Assemble a shareable public profile.
 *
 * Pure: the caller has already resolved the user and confirmed they are
 * not a guest. This only decides how the numbers are presented.
 */
export function buildPublicProfile(
  identity: PublicProfileIdentity,
  aggregates: PublicProfileAggregates
): PublicProfile {
  return {
    username: identity.username,
    displayName: identity.displayName,
    ...(identity.avatarUrl !== undefined ? { avatarUrl: identity.avatarUrl } : {}),
    createdAt: identity.createdAt,
    totalScore: identity.totalScore,
    currentStreak: identity.currentStreak,
    longestStreak: identity.longestStreak ?? 0,
    gamesPlayed: count(aggregates.gamesPlayed),
    badges: aggregates.badges.map((row) => ({ key: row.item_key, quantity: row.quantity })),
    recentSessions: aggregates.recentSessions.map((row) => ({
      challengeDate: row.challengeDate,
      totalScore: count(row.totalScore),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    })),
  }
}

export interface PlayerStatsServiceDeps {
  logger: LogWriter
  playerStatsRepository: PlayerStatsRepository
  /** Reads the streak columns; narrowed to the one method needed. */
  streakLookup: { findById(id: string): Promise<PlayerStreakSnapshot | null> }
}

export interface PlayerStatsService {
  getAdvancedStats(userId: string): Promise<AdvancedStats>
  getPublicProfile(identity: PublicProfileIdentity & { id: string }): Promise<PublicProfile>
}

export function createPlayerStatsService(deps: PlayerStatsServiceDeps): PlayerStatsService {
  const { logger, playerStatsRepository, streakLookup } = deps

  return {
    async getAdvancedStats(userId: string): Promise<AdvancedStats> {
      logger.debug({ userId }, 'building advanced stats')

      const [aggregates, user] = await Promise.all([
        playerStatsRepository.fetchAdvancedStats(userId, ADVANCED_STATS_MONTHS),
        streakLookup.findById(userId),
      ])

      return buildAdvancedStats(aggregates, user ?? {})
    },

    async getPublicProfile(identity): Promise<PublicProfile> {
      logger.debug({ userId: identity.id }, 'building public profile')

      const aggregates = await playerStatsRepository.fetchPublicProfileAggregates(
        identity.id,
        PUBLIC_PROFILE_RECENT_SESSIONS
      )
      return buildPublicProfile(identity, aggregates)
    },
  }
}
