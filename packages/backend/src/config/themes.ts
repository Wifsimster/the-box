export const DEFAULT_THEME_KEY = 'default' as const

export const PREMIUM_THEME_KEYS = [
  'neon_pink',
  'cyber_blue',
  'emerald_matrix',
  'sunset_blaze',
  'retro_80s',
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
