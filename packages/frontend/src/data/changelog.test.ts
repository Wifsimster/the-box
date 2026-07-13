import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, resolveChangelogAutoOpen } from './changelog'

describe('compareVersions', () => {
  it('orders numeric major.minor.patch versions', () => {
    assert.ok(compareVersions('2.142.0', '2.135.0') > 0)
    assert.ok(compareVersions('2.135.0', '2.142.0') < 0)
    assert.equal(compareVersions('2.142.0', '2.142.0'), 0)
  })

  it('compares numerically, not lexicographically', () => {
    assert.ok(compareVersions('2.10.0', '2.9.0') > 0)
  })

  it('treats missing segments as zero', () => {
    assert.equal(compareVersions('2.142', '2.142.0'), 0)
    assert.ok(compareVersions('2.142.1', '2.142') > 0)
  })

  it('ignores pre-release suffixes and sorts non-numeric input lowest', () => {
    assert.equal(compareVersions('2.142.0-beta.1', '2.142.0'), 0)
    assert.ok(compareVersions('dev', '0.0.1') < 0)
  })
})

describe('resolveChangelogAutoOpen', () => {
  it('does nothing when no release is announced', () => {
    assert.equal(resolveChangelogAutoOpen(null, null), 'none')
    assert.equal(resolveChangelogAutoOpen(undefined, '2.142.0'), 'none')
  })

  it('silently marks brand-new visitors instead of greeting them with notes', () => {
    assert.equal(resolveChangelogAutoOpen('2.142.0', null), 'mark-seen')
  })

  it('opens once when a release newer than the marker is announced', () => {
    assert.equal(resolveChangelogAutoOpen('2.142.0', '2.135.0'), 'open')
  })

  it('stays closed once the newest announced release is acknowledged', () => {
    assert.equal(resolveChangelogAutoOpen('2.142.0', '2.142.0'), 'none')
  })

  // Regression: markers written by the pre-fix code hold a *build* version,
  // which runs ahead of the changelog registry (builds bump on every deploy).
  // Those must read as already-seen — the old code compared the marker to the
  // build version instead, so every deploy re-opened the dialog with the same
  // stale notes.
  it('treats a marker ahead of the registry (legacy build-version marker) as seen', () => {
    assert.equal(resolveChangelogAutoOpen('2.142.0', '2.154.0'), 'none')
  })
})
