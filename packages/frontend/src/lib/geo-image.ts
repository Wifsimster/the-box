// Mirror of the backend's PLACEHOLDER_URL_PATTERNS in
// packages/backend/src/domain/services/geo-game.service.ts. Keep both lists in
// sync — the backend refuses to *serve* these URLs, the frontend refuses to
// *render* them in case a stale row sneaks through (cached responses, mocked
// API mode, etc.).
const PLACEHOLDER_URL_PATTERNS: RegExp[] = [
    /(^|\/\/)placehold\.co\//i,
    /(^|\/\/)via\.placeholder\.com\//i,
    /\/map-placeholder\.(jpg|jpeg|png|webp)(\?|$)/i,
]

export function isPlaceholderImageUrl(url: string | null | undefined): boolean {
    if (!url) return true
    return PLACEHOLDER_URL_PATTERNS.some((p) => p.test(url))
}

/**
 * Coordinates in the Geo feature are normalized to [0..1] so a map asset
 * swap doesn't invalidate historical pins. Both MapCanvas variants depend
 * on this helper; keeping it shared avoids the two implementations
 * silently drifting apart.
 */
export function clamp01(n: number): number {
    if (Number.isNaN(n)) return 0
    return Math.max(0, Math.min(1, n))
}
