export interface BackfillCandidate {
  gameId: number
  hasActiveMap: boolean
  candidateCount: number
  topPinCount: number
}

export function backfillPriority(c: BackfillCandidate): number {
  if (c.hasActiveMap && c.candidateCount > 0) {
    return 3000 + Math.min(Math.max(c.topPinCount, 0), 999)
  }
  if (c.hasActiveMap) return 2000
  return 1000
}

export interface BackfillTarget {
  gameId: number
  priority: number
}

export function rankBackfillTargets(
  candidates: BackfillCandidate[],
  batchSize: number,
): BackfillTarget[] {
  return candidates
    .map((c) => ({ gameId: c.gameId, priority: backfillPriority(c) }))
    .sort((a, b) => b.priority - a.priority || a.gameId - b.gameId)
    .slice(0, Math.max(0, batchSize))
}
