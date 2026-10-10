import crypto from 'node:crypto'
import { isIPv6 } from 'node:net'
import { env } from '../../config/env.js'

// Keyed, daily-rotating hash of a client IP for the leaderboard per-
// connection cap. The raw IP is never persisted: only this hash is, and only
// for the day it was computed (rows are purged once the day is over).
//
// Key schedule:
//   master = HKDF-SHA256(BETTER_AUTH_SECRET, info = 'the-box/leaderboard-ip-cap/v1')
//   dayKey = HMAC-SHA256(master, 'day:' + YYYY-MM-DD)
//   hash   = HMAC-SHA256(dayKey, normalizedIp)
// Domain separation follows secret-box.ts, so no new env var is needed. The
// per-day key makes hashes from two days unlinkable: the same connection
// gets an unrelated hash tomorrow.

const HKDF_INFO = Buffer.from('the-box/leaderboard-ip-cap/v1')

/**
 * Canonical form of a client address before hashing.
 * - IPv4-mapped IPv6 (`::ffff:1.2.3.4`, what Node reports on dual-stack
 *   sockets) collapses to the plain IPv4 address.
 * - IPv6 is reduced to its /64 prefix: one subscriber line usually owns a
 *   whole /64, so hashing the full address would let a single home rotate
 *   through billions of "connections".
 */
export function normalizeClientIp(ip: string): string {
  const trimmed = ip.trim().toLowerCase()
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(trimmed)
  if (mapped) return mapped[1]!
  if (!isIPv6(trimmed)) return trimmed
  return `${expandIpv6(trimmed).slice(0, 4).join(':')}::/64`
}

function expandIpv6(ip: string): string[] {
  const withoutZone = ip.split('%')[0]!
  const [head = '', tail] = withoutZone.split('::')
  const headParts = head ? head.split(':') : []
  const tailParts = tail ? tail.split(':') : []
  const missing = tail === undefined ? 0 : 8 - headParts.length - tailParts.length
  return [...headParts, ...Array<string>(missing).fill('0'), ...tailParts].map((part) =>
    part.padStart(4, '0'),
  )
}

/** Build a hasher bound to a master secret. Exported for tests. */
export function createDailyIpHasher(secret: string): (ip: string, day: string) => string {
  const master = Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), HKDF_INFO, 32),
  )
  return (ip, day) => {
    const dayKey = crypto.createHmac('sha256', master).update(`day:${day}`).digest()
    return crypto.createHmac('sha256', dayKey).update(normalizeClientIp(ip)).digest('hex')
  }
}

export const hashClientIpForDay = createDailyIpHasher(env.BETTER_AUTH_SECRET)
