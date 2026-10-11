import type { PercentileResponse } from '@the-box/types'

/**
 * Raw counts read in one SQL statement over a challenge's ranked sessions
 * (completed, not catch-up, not anonymous).
 */
export interface StandingCounts {
  /** Ranked sessions on the challenge. */
  rankedPlayers: number
  /** Ranked sessions that scored strictly more than the score being placed. */
  playersAbove: number
  /**
   * Whether the score being placed belongs to one of the `rankedPlayers`
   * sessions. `undefined` when the caller only has a bare score: membership
   * is then inferred, and the score is treated as an outsider when it is
   * below every ranked session (it cannot be one of them).
   */
  selfCounted?: boolean
}

/** {@link StandingCounts} for one stored session, membership known. */
export interface SessionStandingCounts extends StandingCounts {
  sessionId: string
  totalScore: number
  /** The session itself is completed, not catch-up and not a guest's. */
  selfCounted: boolean
}

/**
 * Turn standing counts into the rank, total and "top X%" shown to players.
 *
 * Invariant: `1 <= rank <= totalPlayers`. A score that is not itself on the
 * board is placed hypothetically and counted once in the total, so a stale
 * or partial score can never produce "Rank #2 of 1 players".
 */
export function computeStanding(counts: StandingCounts): PercentileResponse {
  const rankedPlayers = Math.max(0, Math.trunc(counts.rankedPlayers))
  const playersAbove = Math.min(Math.max(0, Math.trunc(counts.playersAbove)), rankedPlayers)
  const selfCounted = counts.selfCounted ?? playersAbove < rankedPlayers
  const totalPlayers = selfCounted && rankedPlayers > 0 ? rankedPlayers : rankedPlayers + 1
  const rank = Math.min(playersAbove + 1, totalPlayers)
  // Top 1% = best player, top 100% = last.
  const percentile = Math.min(100, Math.max(1, Math.round((rank / totalPlayers) * 100)))
  return { percentile, totalPlayers, rank }
}
