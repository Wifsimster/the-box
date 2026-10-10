import type {
  CountryCode,
  CountryLeaderboardResponse,
  LeaderboardResponse,
  PercentileResponse,
  MonthlyLeaderboardResponse,
} from '@the-box/types'
import type {
  DomainLogger,
  DailyChallengeLookup,
  LeaderboardRepository,
} from '../ports/index.js'
import { MIN_PLAYERS_PER_COUNTRY, countCountryPlayers, rankCountries } from './country-leaderboard.js'

/** Minimal projection of today's rank-1 player for outbound nudges. */
export interface TodayLeader {
  userId: string
  displayName: string
  totalScore: number
}

export interface LeaderboardService {
  getTodayLeaderboard(): Promise<LeaderboardResponse>
  getLeaderboardByDate(date: string): Promise<LeaderboardResponse>
  getTodayPercentile(score: number): Promise<PercentileResponse>
  getMonthlyLeaderboard(year: number, month: number): Promise<MonthlyLeaderboardResponse>
  /**
   * Monthly country ranking (see `rankCountries`). `viewer` is the signed-in
   * player's declared country (`null` when they have none); omit it for an
   * anonymous request.
   */
  getMonthlyCountryLeaderboard(
    year: number,
    month: number,
    viewer?: { countryCode: CountryCode | null },
  ): Promise<CountryLeaderboardResponse>
  /**
   * Today's title holder (rank 1), or null when there is no challenge or
   * nobody has completed a ranked session yet. Cheap — fetches a single row.
   */
  getTodayLeader(): Promise<TodayLeader | null>
  /**
   * How many ranked players have finished today's challenge. Powers the
   * public "joined by N players today" social-proof badge. Returns count 0
   * when there is no challenge yet.
   */
  getTodayPlayerCount(): Promise<{ date: string; count: number }>
}

export interface LeaderboardServiceDeps {
  logger: DomainLogger
  /**
   * Only resolves a date to a challenge id. Narrowed from the full
   * `ChallengeRepository` so this read-only service cannot reach the
   * challenge-writing methods.
   */
  challengeRepository: DailyChallengeLookup
  leaderboardRepository: LeaderboardRepository
}

/**
 * Create a LeaderboardService with injected dependencies.
 */
export function createLeaderboardService(deps: LeaderboardServiceDeps): LeaderboardService {
  const { challengeRepository, leaderboardRepository } = deps
  // Reserved for future use — keep the logger bound to this service to
  // match the pattern used by other services.
  void deps.logger.child({ service: 'leaderboard' })

  return {
    async getTodayLeaderboard(): Promise<LeaderboardResponse> {
      const today = new Date().toISOString().split('T')[0]!

      const challenge = await challengeRepository.findByDate(today)

      if (!challenge) {
        return {
          date: today,
          entries: [],
        }
      }

      const entries = await leaderboardRepository.findByChallenge(challenge.id)

      return {
        date: today,
        challengeId: challenge.id,
        entries,
      }
    },

    async getLeaderboardByDate(date: string): Promise<LeaderboardResponse> {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Invalid date format. Use YYYY-MM-DD')
      }

      const challenge = await challengeRepository.findByDate(date)

      if (!challenge) {
        return {
          date,
          entries: [],
        }
      }

      const entries = await leaderboardRepository.findByChallenge(challenge.id)

      return {
        date,
        challengeId: challenge.id,
        entries,
      }
    },

    async getTodayLeader(): Promise<TodayLeader | null> {
      const today = new Date().toISOString().split('T')[0]!

      const challenge = await challengeRepository.findByDate(today)
      if (!challenge) return null

      // findByChallenge is already deterministically tie-broken (score desc →
      // fastest finish → user id) and excludes anonymous + catch-up sessions,
      // so the first row is unambiguously today's leader. Fetch just one.
      const [leader] = await leaderboardRepository.findByChallenge(challenge.id, 1)
      if (!leader) return null

      return {
        userId: leader.userId,
        displayName: leader.displayName,
        totalScore: leader.totalScore,
      }
    },

    async getTodayPlayerCount(): Promise<{ date: string; count: number }> {
      const today = new Date().toISOString().split('T')[0]!
      const challenge = await challengeRepository.findByDate(today)
      if (!challenge) return { date: today, count: 0 }
      const count = await leaderboardRepository.countPlayersByChallenge(challenge.id)
      return { date: today, count }
    },

    async getTodayPercentile(score: number): Promise<PercentileResponse> {
      const today = new Date().toISOString().split('T')[0]!

      const challenge = await challengeRepository.findByDate(today)

      if (!challenge) {
        // No challenge today, return default values
        return { percentile: 100, totalPlayers: 0, rank: 1 }
      }

      return leaderboardRepository.getPercentileForScore(challenge.id, score)
    },

    async getMonthlyLeaderboard(year: number, month: number): Promise<MonthlyLeaderboardResponse> {
      assertPastOrCurrentMonth(year, month)

      const entries = await leaderboardRepository.findByMonth(year, month)

      return {
        year,
        month,
        entries,
      }
    },

    async getMonthlyCountryLeaderboard(
      year: number,
      month: number,
      viewer?: { countryCode: CountryCode | null },
    ): Promise<CountryLeaderboardResponse> {
      assertPastOrCurrentMonth(year, month)

      const players = await leaderboardRepository.findCountryPlayerStatsByMonth(year, month)
      const response: CountryLeaderboardResponse = {
        year,
        month,
        minPlayers: MIN_PLAYERS_PER_COUNTRY,
        entries: rankCountries(players, MIN_PLAYERS_PER_COUNTRY),
      }
      if (viewer) {
        response.viewer = {
          countryCode: viewer.countryCode,
          playerCount: viewer.countryCode ? countCountryPlayers(players, viewer.countryCode) : 0,
        }
      }
      return response
    },
  }
}

function assertPastOrCurrentMonth(year: number, month: number): void {
  // Validate month (1-12)
  if (month < 1 || month > 12) {
    throw new Error('Invalid month. Must be between 1 and 12')
  }

  // Prevent future months
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // getMonth() returns 0-11

  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    throw new Error('Cannot request leaderboard for future months')
  }
}
