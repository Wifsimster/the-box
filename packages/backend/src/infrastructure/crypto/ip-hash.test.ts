import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createDailyIpHasher, normalizeClientIp } from './ip-hash.js'

const hash = createDailyIpHasher('test-secret-at-least-32-characters-long')

describe('normalizeClientIp', () => {
  it('collapses IPv4-mapped IPv6 to plain IPv4', () => {
    assert.equal(normalizeClientIp('::ffff:203.0.113.7'), '203.0.113.7')
  })

  it('reduces IPv6 to its /64 so one line cannot rotate addresses', () => {
    assert.equal(
      normalizeClientIp('2001:db8:abcd:12::1'),
      normalizeClientIp('2001:0db8:abcd:0012:ffff:eeee:dddd:cccc'),
    )
    assert.equal(normalizeClientIp('2001:db8:abcd:12::1'), '2001:0db8:abcd:0012::/64')
  })

  it('keeps distinct /64 prefixes distinct', () => {
    assert.notEqual(normalizeClientIp('2001:db8:abcd:12::1'), normalizeClientIp('2001:db8:abcd:13::1'))
  })
})

describe('createDailyIpHasher', () => {
  it('is stable for one IP within a day', () => {
    assert.equal(hash('203.0.113.7', '2026-10-10'), hash('203.0.113.7', '2026-10-10'))
  })

  it('rotates every day: the same IP is unlinkable across days', () => {
    assert.notEqual(hash('203.0.113.7', '2026-10-10'), hash('203.0.113.7', '2026-10-11'))
  })

  it('separates different IPs on the same day', () => {
    assert.notEqual(hash('203.0.113.7', '2026-10-10'), hash('203.0.113.8', '2026-10-10'))
  })

  it('depends on the server secret', () => {
    const other = createDailyIpHasher('another-secret-at-least-32-characters')
    assert.notEqual(hash('203.0.113.7', '2026-10-10'), other('203.0.113.7', '2026-10-10'))
  })

  it('outputs a fixed-width hex digest that does not contain the IP', () => {
    const digest = hash('203.0.113.7', '2026-10-10')
    assert.match(digest, /^[0-9a-f]{64}$/)
    assert.ok(!digest.includes('203'))
  })

  it('treats an IPv4-mapped address like its IPv4 form', () => {
    assert.equal(hash('::ffff:203.0.113.7', '2026-10-10'), hash('203.0.113.7', '2026-10-10'))
  })
})
