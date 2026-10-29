import type { GeoGamersHealthSnapshot } from '@the-box/types'
import { env } from '../config/env.js'
import { geoGamersChallengeRepository } from './repositories/geogamers-challenge.repository.js'
import { geoGamersSeasonRepository } from './repositories/geogamers-season.repository.js'

export async function getGeoGamersHealthSnapshot(): Promise<GeoGamersHealthSnapshot> {
  const enabled = env.GEOGAMERS_ENABLED === 'true'
  const minRequired = Number(env.GEOGAMERS_MIN_ELIGIBLE_GAMES) || 10
  const cooldownDays = Number(env.GEOGAMERS_GAME_COOLDOWN_DAYS) || 14

  const today = new Date().toISOString().slice(0, 10)
  const [todayChallenge, current, cooldownGameIds] = await Promise.all([
    geoGamersChallengeRepository.findByDate(today),
    geoGamersChallengeRepository.findCurrent(),
    geoGamersChallengeRepository.gameIdsUsedSince(cooldownDays),
  ])

  const eligible = await geoGamersChallengeRepository.listEligibleMetas({ cooldownGameIds })
  const eligibleGames = new Set(eligible.map((e) => e.gameId)).size
  const eligibleScreenshots = eligible.length

  const month = geoGamersSeasonRepository.currentSeasonMonth()
  const seasonPlayers = await geoGamersSeasonRepository.playerCount(month)

  return {
    enabled,
    minRequired,
    cooldownDays,
    eligibleGames,
    eligibleScreenshots,
    gamesOnCooldown: cooldownGameIds.length,
    starved: eligibleGames < minRequired,
    todayChallengeExists: !!todayChallenge,
    currentChallengeDate: current?.challengeDate ?? null,
    season: { month, players: seasonPlayers },
  }
}
