import type {
  CountryCode,
  CountryLeaderboardResponse,
  LeaderboardResponse,
  PercentileResponse,
  MonthlyLeaderboardResponse,
  SessionStandingResponse,
} from '@the-box/types'
import type {
  DomainLogger,
  DailyChallengeLookup,
  LeaderboardRepository,
} from '../ports/index.js'
import { computeStanding } from './leaderboard-standing.js'
import { MIN_PLAYERS_PER_COUNTRY, countCountryPlayers, rankCountries } from './country-leaderboard.js'

export interface TodayLeader {
  userId: string
  displayName: string
  totalScore: number
}

export interface LeaderboardService {
  getTodayLeaderboard(): Promise<LeaderboardResponse>
  getLeaderboardByDate(date: string): Promise<LeaderboardResponse>
  getTodayPercentile(score: number): Promise<PercentileResponse>
  getSessionStanding(sessionId: string, userId: string): Promise<SessionStandingResponse | null>
  getMonthlyLeaderboard(year: number, month: number): Promise<MonthlyLeaderboardResponse>
  getMonthlyCountryLeaderboard(
    year: number,
    month: number,
    viewer?: { countryCode: CountryCode | null },
  ): Promise<CountryLeaderboardResponse>
  getTodayLeader(): Promise<TodayLeader | null>
  getTodayPlayerCount(): Promise<{ date: string; count: number }>
}

export interface LeaderboardServiceDeps {
  logger: DomainLogger
  challengeRepository: DailyChallengeLookup
  leaderboardRepository: LeaderboardRepository
}

export function createLeaderboardService(deps: LeaderboardServiceDeps): LeaderboardService {
  const { challengeRepository, leaderboardRepository } = deps
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

      const [entries, guestPlayers] = await Promise.all([
        leaderboardRepository.findByChallenge(challenge.id),
        leaderboardRepository.countGuestPlayersByChallenge(challenge.id),
      ])

      return {
        date: today,
        challengeId: challenge.id,
        entries,
        guestPlayers,
      }
    },

    async getLeaderboardByDate(date: string): Promise<LeaderboardResponse> {
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

      const [entries, guestPlayers] = await Promise.all([
        leaderboardRepository.findByChallenge(challenge.id),
        leaderboardRepository.countGuestPlayersByChallenge(challenge.id),
      ])

      return {
        date,
        challengeId: challenge.id,
        entries,
        guestPlayers,
      }
    },

    async getTodayLeader(): Promise<TodayLeader | null> {
      const today = new Date().toISOString().split('T')[0]!

      const challenge = await challengeRepository.findByDate(today)
      if (!challenge) return null

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
        return { percentile: 100, totalPlayers: 0, rank: 1 }
      }

      const counts = await leaderboardRepository.countStandingForScore(challenge.id, score)
      return computeStanding(counts)
    },

    async getSessionStanding(sessionId: string, userId: string): Promise<SessionStandingResponse | null> {
      const counts = await leaderboardRepository.findSessionStandingCounts(sessionId, userId)
      if (!counts) return null
      return {
        sessionId: counts.sessionId,
        totalScore: counts.totalScore,
        ranked: counts.selfCounted,
        ...computeStanding(counts),
      }
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
  if (month < 1 || month > 12) {
    throw new Error('Invalid month. Must be between 1 and 12')
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    throw new Error('Cannot request leaderboard for future months')
  }
}
