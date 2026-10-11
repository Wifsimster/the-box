/** A rank banner's numbers; `null` fields hide the banner. */
export interface Standing {
  percentile: number | null
  rank: number | null
  totalPlayers: number | null
}

const HIDDEN: Standing = { percentile: null, rank: null, totalPlayers: null }

const isPositiveInt = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1

/**
 * Display guard for a leaderboard standing: returns the standing unchanged
 * when it is coherent, otherwise hides it. Coherent means
 * `1 <= rank <= totalPlayers` and a "top X%" between 1 and 100.
 *
 * The backend already guarantees this, so the guard only fires on a bug or
 * a stale payload. Hiding the banner beats showing "Rank #2 of 1 players".
 */
export function displayableStanding(standing: Partial<Standing>): Standing {
  const { percentile = null, rank = null, totalPlayers = null } = standing
  if (!isPositiveInt(totalPlayers)) return HIDDEN
  if (rank !== null && (!isPositiveInt(rank) || rank > totalPlayers)) return HIDDEN
  if (percentile !== null && !(Number.isFinite(percentile) && percentile >= 1 && percentile <= 100)) {
    return HIDDEN
  }
  return { percentile, rank, totalPlayers }
}
