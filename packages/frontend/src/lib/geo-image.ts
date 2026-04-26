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
