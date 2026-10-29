export interface Standing {
  percentile: number | null
  rank: number | null
  totalPlayers: number | null
}

const HIDDEN: Standing = { percentile: null, rank: null, totalPlayers: null }

const isPositiveInt = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1

export function displayableStanding(standing: Partial<Standing>): Standing {
  const { percentile = null, rank = null, totalPlayers = null } = standing
  if (!isPositiveInt(totalPlayers)) return HIDDEN
  if (rank !== null && (!isPositiveInt(rank) || rank > totalPlayers)) return HIDDEN
  if (percentile !== null && !(Number.isFinite(percentile) && percentile >= 1 && percentile <= 100)) {
    return HIDDEN
  }
  return { percentile, rank, totalPlayers }
}
