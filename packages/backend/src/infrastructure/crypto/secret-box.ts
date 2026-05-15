import crypto from 'node:crypto'
import { env } from '../../config/env.js'

// Authenticated symmetric encryption for secrets that must survive a process
// restart but must NOT be readable from a raw database dump alone.
//
// Used by the webhook subsystem: webhook signing secrets are encrypted with
// this box before they hit the `webhooks` table. A DB compromise yields
// ciphertext, not usable HMAC keys — forging a signature still needs the
// process's BETTER_AUTH_SECRET.
//
// Cipher: AES-256-GCM (authenticated — tampered ciphertext fails to decrypt
// rather than returning garbage). Key: derived from BETTER_AUTH_SECRET via
// HKDF-SHA256 with a domain-separation label, so this key can never collide
// with any other use of that secret (sessions, etc.). No new env var needed.
//
// Rotation note: rotating BETTER_AUTH_SECRET invalidates every encrypted
// webhook secret (decryption returns null → deliveries go out unsigned until
// the owner re-registers). That's the same blast radius as rotating it for
// sessions, and rotation is already a deliberate, rare operation.

const HKDF_INFO = Buffer.from('the-box/webhook-secret/v1')

// hkdfSync returns an ArrayBuffer; wrap once at module load.
const KEY = Buffer.from(
  crypto.hkdfSync('sha256', Buffer.from(env.BETTER_AUTH_SECRET), Buffer.alloc(0), HKDF_INFO, 32),
)

// Encoded form: base64(iv).base64(authTag).base64(ciphertext)
const PARTS = 3

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12) // 96-bit nonce — the GCM standard.
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.')
}

/**
 * Decrypts a value produced by `encryptSecret`. Returns null on any failure
 * — malformed input, wrong key (post-rotation), or a failed auth tag
 * (tampering). Callers treat null as "secret unavailable" rather than
 * throwing, so one bad row can't crash a delivery batch.
 */
export function decryptSecret(encoded: string): string | null {
  const parts = encoded.split('.')
  if (parts.length !== PARTS) return null
  const [ivB64, tagB64, ctB64] = parts
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      KEY,
      Buffer.from(ivB64!, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(tagB64!, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64!, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}
