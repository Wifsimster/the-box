import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import net from 'node:net'

type LookupAddress = { address: string; family: number }

// Webhook delivery primitives — all pure, no DB / HTTP / queue dependencies.
// The worker (queue/workers/webhook-delivery.worker.ts) composes these into
// the actual POST + retry flow; routes use `validateWebhookUrl` at register
// time so a malformed URL never enters the table.

// ────────────────────────────────────────────────────────────
// HMAC signing — Stripe-style v1 signature.
// Format: `t=<unix_seconds>,v1=<hex hmac_sha256(secret, "<t>.<body>")>`
// Receivers verify by recomputing on the raw body.
// ────────────────────────────────────────────────────────────

export interface SignedHeaders {
  signature: string
  timestamp: number
}

export function signWebhookBody(secret: string, body: string, now = Date.now()): SignedHeaders {
  const timestamp = Math.floor(now / 1000)
  const signedPayload = `${timestamp}.${body}`
  const v1 = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return { signature: `t=${timestamp},v1=${v1}`, timestamp }
}

// ────────────────────────────────────────────────────────────
// SSRF guard.
//
// User-supplied URLs are a known attack vector — without this gate someone
// could register `http://169.254.169.254/latest/meta-data/` and have the
// worker happily POST to AWS' metadata service. Two-layer defence:
//
//   - validateWebhookUrl(): cheap protocol / host check at register time.
//     Rejects obvious internal addresses (private CIDRs, loopback, link-local,
//     metadata IPs) AND our own host.
//
//   - resolveWebhookUrlSafely(): re-resolve DNS at DELIVERY time and re-check
//     every resolved address. This defeats DNS rebinding (`evil.com` resolves
//     to a public IP at register, then to 169.254.169.254 at delivery).
//
// Both are required. Skipping either reopens the hole.
// ────────────────────────────────────────────────────────────

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  // GitHub-hosted runners and many other ephemeral envs hit this one.
  'instance-data',
])

// AWS / GCP / Azure metadata IPs, plus IPv6 forms.
const METADATA_IPS = new Set([
  '169.254.169.254',
  'fd00:ec2::254',
])

export interface WebhookUrlValidation {
  ok: boolean
  // Machine-readable failure code surfaced to the client.
  code?:
    | 'INVALID_URL'
    | 'NOT_HTTPS'
    | 'BLOCKED_HOST'
    | 'OWN_HOST'
    | 'PRIVATE_IP'
    | 'METADATA_IP'
}

export function validateWebhookUrl(urlString: string, ownApiUrl: string): WebhookUrlValidation {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return { ok: false, code: 'INVALID_URL' }
  }

  // HTTPS only. http:// is acceptable for local-dev test endpoints (allow
  // 127.0.0.1 / localhost in NODE_ENV=development would be a separate
  // explicit knob); for prod registration the hard rule wins.
  if (url.protocol !== 'https:') {
    return { ok: false, code: 'NOT_HTTPS' }
  }

  const hostname = url.hostname.toLowerCase()

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, code: 'BLOCKED_HOST' }
  }

  // Reject obvious literal IPs at the syntactic layer; resolveWebhookUrlSafely
  // re-checks against the DNS resolution at delivery time.
  if (net.isIP(hostname)) {
    if (METADATA_IPS.has(hostname)) return { ok: false, code: 'METADATA_IP' }
    if (isPrivateOrReservedIp(hostname)) return { ok: false, code: 'PRIVATE_IP' }
  }

  // Refuse to call ourselves. Compare on hostname only — port mismatches
  // don't save you, an attacker can pick the right port.
  try {
    const own = new URL(ownApiUrl)
    if (own.hostname.toLowerCase() === hostname) {
      return { ok: false, code: 'OWN_HOST' }
    }
  } catch {
    // If ownApiUrl is misconfigured, fail-closed — better than letting
    // requests leak through with an undefined comparison.
    return { ok: false, code: 'OWN_HOST' }
  }

  return { ok: true }
}

/**
 * Resolve all A/AAAA records for the URL and verify NONE point at private
 * / metadata / loopback ranges. Called at delivery time so DNS rebinding
 * can't trick us. Returns the resolved addresses for the caller's use.
 */
export async function resolveWebhookUrlSafely(urlString: string): Promise<{
  ok: boolean
  code?: 'INVALID_URL' | 'DNS_FAILURE' | 'PRIVATE_IP' | 'METADATA_IP'
  addresses?: string[]
}> {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return { ok: false, code: 'INVALID_URL' }
  }

  // If the URL already encodes a literal IP, validateWebhookUrl handled it
  // at register time and we trust that gate — DNS lookup would be a no-op.
  if (net.isIP(url.hostname)) {
    return { ok: true, addresses: [url.hostname] }
  }

  let resolved: LookupAddress[]
  try {
    resolved = await dns.lookup(url.hostname, { all: true })
  } catch {
    return { ok: false, code: 'DNS_FAILURE' }
  }
  if (resolved.length === 0) {
    return { ok: false, code: 'DNS_FAILURE' }
  }

  const addresses = resolved.map((r) => r.address)
  for (const addr of addresses) {
    if (METADATA_IPS.has(addr)) return { ok: false, code: 'METADATA_IP', addresses }
    if (isPrivateOrReservedIp(addr)) return { ok: false, code: 'PRIVATE_IP', addresses }
  }
  return { ok: true, addresses }
}

// IPv4 + IPv6 private / reserved ranges. Not exhaustive on IPv6 — we cover
// the categories an SSRF attacker actually reaches for (link-local, ULA,
// loopback). Bulk additions go here as we encounter new bypasses.
export function isPrivateOrReservedIp(addr: string): boolean {
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map((n) => Number(n))
    if (a === undefined || b === undefined) return true
    // 10.0.0.0/8
    if (a === 10) return true
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true
    // 127.0.0.0/8 loopback
    if (a === 127) return true
    // 169.254.0.0/16 link-local
    if (a === 169 && b === 254) return true
    // 100.64.0.0/10 CGNAT
    if (a === 100 && b >= 64 && b <= 127) return true
    // 0.0.0.0/8, 224.0.0.0/4 (multicast), 240.0.0.0/4 (reserved)
    if (a === 0 || (a >= 224 && a <= 255)) return true
    return false
  }
  if (net.isIPv6(addr)) {
    const lower = addr.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    // fc00::/7 ULA
    if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true
    // fe80::/10 link-local
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true
    // IPv4-mapped — recurse on the embedded address.
    const mapped = /^::ffff:([0-9.]+)$/.exec(lower)
    if (mapped && mapped[1]) return isPrivateOrReservedIp(mapped[1])
    return false
  }
  // Unrecognized format — treat as suspicious.
  return true
}
