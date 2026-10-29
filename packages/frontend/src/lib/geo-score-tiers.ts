export const GEO_SCORE_TIER_BANDS = {
    high: 1500,
    mid: 500,
} as const

export const GEO_ROUND_MAX = 2000

export type GeoScoreTier = 'high' | 'mid' | 'low'

export function geoScoreTier(score: number): GeoScoreTier {
    if (score >= GEO_SCORE_TIER_BANDS.high) return 'high'
    if (score >= GEO_SCORE_TIER_BANDS.mid) return 'mid'
    return 'low'
}
