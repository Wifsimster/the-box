export type ThemeKey =
  | 'default'
  | 'neon_pink'
  | 'cyber_blue'
  | 'emerald_matrix'
  | 'sunset_blaze'
  | 'retro_80s'

export interface ThemeMeta {
  key: ThemeKey
  i18nKey: string
  premium: boolean
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
  {
    key: 'retro_80s',
    i18nKey: 'retro80s',
    premium: true,
    swatch: {
      from: 'var(--theme-swatch-retro-80s-from)',
      to: 'var(--theme-swatch-retro-80s-to)',
    },
  },
]

const VALID_THEME_KEYS: ReadonlyArray<ThemeKey> = THEMES.map((t) => t.key)

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && (VALID_THEME_KEYS as readonly string[]).includes(value)
}

export function applyTheme(key: string): void {
  const safe = isThemeKey(key) ? key : 'default'
  document.documentElement.setAttribute('data-theme', safe)
}
