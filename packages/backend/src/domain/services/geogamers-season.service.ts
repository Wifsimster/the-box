import type { DomainLogger } from '../ports/logger.js'
import type { GeoGamersSeasonStanding, GeoGamersSeasonMe } from '@the-box/types'

// Reusable ranking port. Each mode owns a season ranking that plugs into the
// shared payout loop (leaderboard-payout worker) instead of copy-pasting the
// aggregation. Future modes implement this same shape.
export interface SeasonRanking {
  findBySeason(month: string, limit?: number, offset?: number): Promise<GeoGamersSeasonStanding[]>
  findUserSeason(month: string, userId: string): Promise<GeoGamersSeasonMe | null>
  playerCount(month: string): Promise<number>
  currentSeasonMonth(referenceMs?: number): string
}

export interface GeoGamersSeasonService {
  currentMonth(): string
  standings(month?: string, limit?: number, offset?: number): Promise<GeoGamersSeasonStanding[]>
  myStanding(userId: string, month?: string): Promise<GeoGamersSeasonMe | null>
  playerCount(month?: string): Promise<number>
}

export interface GeoGamersSeasonServiceDeps {
  logger: DomainLogger
  ranking: SeasonRanking
}

export function createGeoGamersSeasonService(
  deps: GeoGamersSeasonServiceDeps,
): GeoGamersSeasonService {
  const log = deps.logger.child({ service: 'geogamers-season' })
  const month = () => deps.ranking.currentSeasonMonth()

  return {
    currentMonth: month,

    async standings(m, limit = 100, offset = 0) {
      const season = m ?? month()
      const rows = await deps.ranking.findBySeason(season, limit, offset)
      log.debug({ season, count: rows.length }, 'season standings')
      return rows
    },

    async myStanding(userId, m) {
      return deps.ranking.findUserSeason(m ?? month(), userId)
    },

    async playerCount(m) {
      return deps.ranking.playerCount(m ?? month())
    },
  }
}
