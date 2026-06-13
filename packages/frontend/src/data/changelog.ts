/**
 * Changelog registry — drives the "What's New" dialog (`ChangelogDialog`).
 *
 * This is the single source of truth for *which* releases get surfaced to
 * players and *when* they shipped. The human-readable, translatable bullet
 * points live in the i18n bundles under `changelog.releases.<version>` (one
 * block per locale in `public/locales/<lng>/translation.json`), so the dialog
 * renders in the player's language. Keep this list ordered newest-first and
 * add an entry only for releases worth announcing in-app.
 *
 * The running app's version comes from the build-time `__APP_VERSION__`
 * constant (see `vite.config.ts`). The dialog shows a release's notes once,
 * the first time a player runs that version.
 */

export type ChangelogSection = 'features' | 'improvements' | 'fixes'

/** Order in which sections render inside the dialog. */
export const CHANGELOG_SECTIONS: ChangelogSection[] = [
  'features',
  'improvements',
  'fixes',
]

export interface ChangelogRelease {
  /** Semver string, must match a `changelog.releases.<version>` i18n key. */
  version: string
  /** ISO date (YYYY-MM-DD) the release shipped — shown next to the version. */
  date: string
}

/**
 * Releases surfaced in-app, newest first. The first entry is treated as the
 * "current" notes shown after an update and when a player opens the changelog
 * manually from the footer.
 */
export const CHANGELOG: ChangelogRelease[] = [
  { version: '2.127.0', date: '2026-06-13' },
]

/** The newest announced release, or `null` when the list is empty. */
export function getLatestRelease(): ChangelogRelease | null {
  return CHANGELOG[0] ?? null
}

/** Look up a release entry by its version string. */
export function getReleaseByVersion(
  version: string,
): ChangelogRelease | undefined {
  return CHANGELOG.find((release) => release.version === version)
}

/**
 * Compare two semver strings (numeric `major.minor.patch`, ignoring any
 * pre-release suffix). Returns a positive number when `a > b`, negative when
 * `a < b`, and `0` when equal. Non-numeric / `dev` inputs sort lowest.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .split('-')[0]
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)

  const pa = parse(a)
  const pb = parse(b)
  const length = Math.max(pa.length, pb.length)

  for (let i = 0; i < length; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
