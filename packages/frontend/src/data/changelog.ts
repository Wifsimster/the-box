export type ChangelogSection = 'features' | 'improvements' | 'fixes'

export const CHANGELOG_SECTIONS: ChangelogSection[] = [
  'features',
  'improvements',
  'fixes',
]

export interface ChangelogRelease {
  version: string
  date: string
}

export const CHANGELOG: ChangelogRelease[] = [
  { version: '2.142.0', date: '2026-07-10' },
  { version: '2.135.0', date: '2026-06-14' },
  { version: '2.130.0', date: '2026-06-14' },
  { version: '2.127.0', date: '2026-06-13' },
]

export function getLatestRelease(): ChangelogRelease | null {
  return CHANGELOG[0] ?? null
}

export function getReleaseByVersion(
  version: string,
): ChangelogRelease | undefined {
  return CHANGELOG.find((release) => release.version === version)
}

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

export type ChangelogAutoOpenDecision = 'open' | 'mark-seen' | 'none'

export function resolveChangelogAutoOpen(
  latestVersion: string | null | undefined,
  lastSeenVersion: string | null,
): ChangelogAutoOpenDecision {
  if (!latestVersion) return 'none'
  if (lastSeenVersion === null) return 'mark-seen'
  return compareVersions(latestVersion, lastSeenVersion) > 0 ? 'open' : 'none'
}
