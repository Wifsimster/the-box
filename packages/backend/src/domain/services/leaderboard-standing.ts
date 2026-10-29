import type { PercentileResponse } from '@the-box/types'

export interface StandingCounts {
  rankedPlayers: number
  playersAbove: number
  selfCounted?: boolean
}

export interface SessionStandingCounts extends StandingCounts {
  sessionId: string
  totalScore: number
  selfCounted: boolean
}

export function computeStanding(counts: StandingCounts): PercentileResponse {
  const rankedPlayers = Math.max(0, Math.trunc(counts.rankedPlayers))
  const playersAbove = Math.min(Math.max(0, Math.trunc(counts.playersAbove)), rankedPlayers)
  const selfCounted = counts.selfCounted ?? playersAbove < rankedPlayers
  const totalPlayers = selfCounted && rankedPlayers > 0 ? rankedPlayers : rankedPlayers + 1
  const rank = Math.min(playersAbove + 1, totalPlayers)
  const percentile = Math.min(100, Math.max(1, Math.round((rank / totalPlayers) * 100)))
  return { percentile, totalPlayers, rank }
}
