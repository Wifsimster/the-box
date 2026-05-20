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
  // `var(--*)` references to the swatch tokens declared in
  // `src/index.css`. Must NOT reference re-skinnable tokens like
  // `--neon-purple` / `--primary` — `[data-theme]` overrides those, so
  // every card would render in the active theme's palette instead of
  // its own. The `--theme-swatch-*` tokens are defined only on `:root`
  // (no per-theme overrides) precisely so this contract holds.
  swatch: { from: string; to: string }
}

export const THEMES: ReadonlyArray<ThemeMeta> = [
  {
    key: 'default',
    i18nKey: 'default',
    premium: false,
    swatch: {
      from: 'var(--theme-swatch-default-from)',
      to: 'var(--theme-swatch-default-to)',
    },
  },
  {
    key: 'neon_pink',
    i18nKey: 'neonPink',
    premium: true,
    swatch: {
      from: 'var(--theme-swatch-neon-pink-from)',
      to: 'var(--theme-swatch-neon-pink-to)',
    },
  },
  {
    key: 'cyber_blue',
    i18nKey: 'cyberBlue',
    premium: true,
    swatch: {
      from: 'var(--theme-swatch-cyber-blue-from)',
      to: 'var(--theme-swatch-cyber-blue-to)',
    },
  },
  {
    key: 'emerald_matrix',
    i18nKey: 'emeraldMatrix',
    premium: true,
    swatch: {
      from: 'var(--theme-swatch-emerald-matrix-from)',
      to: 'var(--theme-swatch-emerald-matrix-to)',
    },
  },
  {
    key: 'sunset_blaze',
    i18nKey: 'sunsetBlaze',
    premium: true,
    swatch: {
      from: 'var(--theme-swatch-sunset-blaze-from)',
      to: 'var(--theme-swatch-sunset-blaze-to)',
    },
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
