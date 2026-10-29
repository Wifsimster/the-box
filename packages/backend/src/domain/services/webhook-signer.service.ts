import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import net from 'node:net'

type LookupAddress = { address: string; family: number }


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

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'instance-data',
])

const METADATA_IPS = new Set([
  '169.254.169.254',
  'fd00:ec2::254',
])

export interface WebhookUrlValidation {
  ok: boolean
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

  if (url.protocol !== 'https:') {
    return { ok: false, code: 'NOT_HTTPS' }
  }

  const hostname = url.hostname.toLowerCase()

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, code: 'BLOCKED_HOST' }
  }

  if (net.isIP(hostname)) {
    if (METADATA_IPS.has(hostname)) return { ok: false, code: 'METADATA_IP' }
    if (isPrivateOrReservedIp(hostname)) return { ok: false, code: 'PRIVATE_IP' }
  }

  try {
    const own = new URL(ownApiUrl)
    if (own.hostname.toLowerCase() === hostname) {
      return { ok: false, code: 'OWN_HOST' }
    }
  } catch {
    return { ok: false, code: 'OWN_HOST' }
  }

  return { ok: true }
}

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

export function isPrivateOrReservedIp(addr: string): boolean {
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map((n) => Number(n))
    if (a === undefined || b === undefined) return true
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 0 || (a >= 224 && a <= 255)) return true
    return false
  }
  if (net.isIPv6(addr)) {
    const lower = addr.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true
    const mapped = /^::ffff:([0-9.]+)$/.exec(lower)
    if (mapped && mapped[1]) return isPrivateOrReservedIp(mapped[1])
    return false
  }
  return true
}
