// Backfill discovery ranking (issue #331, phase 6).
//
// The regular ingest tick tops up EVERY curated+resolved game (including
// already-eligible ones) toward the candidate cap. Backfill instead points
// sourcing effort at games that are NOT yet eligible, ranked by how close they
// are to earning a first canonical pin — so ingestion moves the eligible-count
// needle instead of re-enriching games that already count.
//
// Pure so the ranking is unit-tested without a DB; the repo supplies the
// signals and the worker drives ingestion for the top-ranked games.

export interface BackfillCandidate {
  gameId: number
  // Does the game have at least one active map? (Captures anchor to a map, so
  // no map ⇒ nothing can be pinned yet.)
  hasActiveMap: boolean
  // Active, not-yet-promoted captures collecting pins.
  candidateCount: number
  // Highest raw pin count among those captures — pin momentum toward the
  // consensus promote threshold.
  topPinCount: number
}

/**
 * Priority score — higher means closer to eligibility, so it's driven first.
 * Bucketed so a game that's "one pin away" always outranks one that still needs
 * a map, regardless of raw counts:
 *   3000+ : has a map AND captures collecting pins  → rank by pin momentum
 *   2000  : has a map but no captures yet            → needs capture ingestion
 *   1000  : curated+resolved but no active map       → needs map ingestion
 */
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

/**
 * Rank candidates by descending priority (ties broken by game id for a stable
 * order) and return the top `batchSize`.
 */
export function rankBackfillTargets(
  candidates: BackfillCandidate[],
  batchSize: number,
): BackfillTarget[] {
  return candidates
    .map((c) => ({ gameId: c.gameId, priority: backfillPriority(c) }))
    .sort((a, b) => b.priority - a.priority || a.gameId - b.gameId)
    .slice(0, Math.max(0, batchSize))
}
