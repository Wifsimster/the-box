// UI theme catalog. Mirrors `packages/backend/src/config/themes.ts`:
// the backend stores the chosen key, this file owns the visual values.
//
// Adding a theme is a two-line change:
//   1. Add the key here (and to backend `PREMIUM_THEME_KEYS`)
//   2. Add a matching `[data-theme="<key>"]` block in `src/index.css`
//      that overrides the variables you want re-skinned.

export type ThemeKey =
  | 'default'
  | 'neon_pink'
  | 'cyber_blue'
  | 'emerald_matrix'
  | 'sunset_blaze'

export interface ThemeMeta {
  key: ThemeKey
  // i18n key under `themes.options.<key>` for the human-readable label.
  // Keeping the label out of this file means a translator can rename a
  // theme without a code change.
  i18nKey: string
  // Whether this theme requires an active premium entitlement. The
  // backend re-validates on PUT /api/user/theme so a tampered client
  // can't slip a premium theme through.
  premium: boolean
  // Fixed hex colors for the preview swatch. Must NOT reference CSS
  // variables / Tailwind semantic tokens — those re-skin with the active
  // `data-theme`, which would make every card look like the currently
  // selected theme instead of previewing its own palette.
  swatch: { from: string; to: string }
}

export const THEMES: ReadonlyArray<ThemeMeta> = [
  {
    key: 'default',
    i18nKey: 'default',
    premium: false,
    swatch: { from: '#a855f7', to: '#f472b6' },
  },
  {
    key: 'neon_pink',
    i18nKey: 'neonPink',
    premium: true,
    swatch: { from: '#f472b6', to: '#ec4899' },
  },
  {
    key: 'cyber_blue',
    i18nKey: 'cyberBlue',
    premium: true,
    swatch: { from: '#3b82f6', to: '#06b6d4' },
  },
  {
    key: 'emerald_matrix',
    i18nKey: 'emeraldMatrix',
    premium: true,
    swatch: { from: '#22c55e', to: '#06b6d4' },
  },
  {
    key: 'sunset_blaze',
    i18nKey: 'sunsetBlaze',
    premium: true,
    swatch: { from: '#eab308', to: '#ef4444' },
  },
]

export const VALID_THEME_KEYS: ReadonlyArray<ThemeKey> = THEMES.map((t) => t.key)

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && (VALID_THEME_KEYS as readonly string[]).includes(value)
}

export function applyTheme(key: string): void {
  const safe = isThemeKey(key) ? key : 'default'
  document.documentElement.setAttribute('data-theme', safe)
}
