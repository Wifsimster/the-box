const PLACEHOLDER_URL_PATTERNS: RegExp[] = [
    /(^|\/\/)placehold\.co\//i,
    /(^|\/\/)via\.placeholder\.com\//i,
    /\/map-placeholder\.(jpg|jpeg|png|webp)(\?|$)/i,
]

export function isPlaceholderImageUrl(url: string | null | undefined): boolean {
    if (!url) return true
    return PLACEHOLDER_URL_PATTERNS.some((p) => p.test(url))
}

export function clamp01(n: number): number {
    if (Number.isNaN(n)) return 0
    return Math.max(0, Math.min(1, n))
}
