// Catalog of valid UI theme keys the API accepts on PUT /api/user/theme.
// `default` is the always-allowed free-tier theme; everything in
// PREMIUM_THEME_KEYS requires an active premium entitlement (the route
// enforces this; this module is just the keyset to validate against).
//
// The visual values (CSS variables) live entirely in the frontend
// `src/lib/themes.ts` registry — backend only stores the chosen key, so
// adding a new theme is a frontend concern except for adding the key
// here.

export const DEFAULT_THEME_KEY = 'default' as const

export const PREMIUM_THEME_KEYS = [
  'neon_pink',
  'cyber_blue',
  'emerald_matrix',
  'sunset_blaze',
] as const

export type PremiumThemeKey = (typeof PREMIUM_THEME_KEYS)[number]

const VALID_KEYS: ReadonlySet<string> = new Set<string>([
  DEFAULT_THEME_KEY,
  ...PREMIUM_THEME_KEYS,
])

export function isValidThemeKey(key: unknown): key is string {
  return typeof key === 'string' && VALID_KEYS.has(key)
}

export function isPremiumThemeKey(key: string): boolean {
  return (PREMIUM_THEME_KEYS as readonly string[]).includes(key)
}
