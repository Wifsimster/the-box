// Qualitative bands for free-play geo scores (max 2000, exponential
// decay — see docs/geo-mode.md). The thresholds map back onto the
// scoring curve: ≥1500 ≈ within ~3.6% of the target, ≥500 ≈ within
// ~17%. Provisional until validated against real pin distributions
// (tasks/geo-play-revamp-proposal.html §11) — which is exactly why
// they live in this single constant.
export const GEO_SCORE_TIER_BANDS = {
    high: 1500,
    mid: 500,
} as const

// Per-round score ceiling from the scoring curve (docs/geo-mode.md).
// Shared by the reveal meter and the run recap bars so a "full" bar
// means the same thing everywhere.
export const GEO_ROUND_MAX = 2000

export type GeoScoreTier = 'high' | 'mid' | 'low'

export function geoScoreTier(score: number): GeoScoreTier {
    if (score >= GEO_SCORE_TIER_BANDS.high) return 'high'
    if (score >= GEO_SCORE_TIER_BANDS.mid) return 'mid'
    return 'low'
}
