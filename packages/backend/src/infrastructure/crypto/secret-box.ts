import crypto from 'node:crypto'
import { env } from '../../config/env.js'

// Authenticated symmetric encryption for secrets that must survive a process
// restart but must NOT be readable from a raw database dump alone.
//
// Used by:
// - the webhook subsystem: signing secrets in the `webhooks` table
//   (label `the-box/webhook-secret/v1`);
// - app settings: secret settings such as the Anthropic API key in
//   `app_settings` (label `the-box/app-setting/v1`).
// A DB compromise yields ciphertext, not usable secrets: decrypting still
// needs the process's BETTER_AUTH_SECRET.
//
// Cipher: AES-256-GCM (authenticated — tampered ciphertext fails to decrypt
// rather than returning garbage). Key: derived from BETTER_AUTH_SECRET via
// HKDF-SHA256 with a per-use domain-separation label, so the keys never
// collide with each other or with any other use of that secret (sessions,
// etc.). No new env var needed.
//
// Rotation note: rotating BETTER_AUTH_SECRET invalidates every encrypted
// value (decryption returns null). Webhooks then go out unsigned until the
// owner re-registers; a secret app setting reads as "not set" until an admin
// pastes it again. That's the same blast radius as rotating it for sessions,
// and rotation is already a deliberate, rare operation.

// Encoded form: base64(iv).base64(authTag).base64(ciphertext)
const PARTS = 3

export interface SecretBox {
  encrypt(plaintext: string): string
  /**
   * Decrypts a value produced by `encrypt`. Returns null on any failure —
   * malformed input, wrong key (post-rotation), or a failed auth tag
   * (tampering). Callers treat null as "secret unavailable" rather than
   * throwing, so one bad row can't crash a batch.
   */
  decrypt(encoded: string): string | null
}

/** A box keyed by HKDF(secret, info). `secret` defaults to BETTER_AUTH_SECRET. */
export function createSecretBox(info: string, secret: string = env.BETTER_AUTH_SECRET): SecretBox {
  // hkdfSync returns an ArrayBuffer; wrap once at creation.
  const key = Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), Buffer.from(info), 32),
  )

  return {
    encrypt(plaintext: string): string {
      const iv = crypto.randomBytes(12) // 96-bit nonce — the GCM standard.
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      const authTag = cipher.getAuthTag()
      return [
        iv.toString('base64'),
        authTag.toString('base64'),
        ciphertext.toString('base64'),
      ].join('.')
    },

    decrypt(encoded: string): string | null {
      const parts = encoded.split('.')
      if (parts.length !== PARTS) return null
      const [ivB64, tagB64, ctB64] = parts
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64!, 'base64'))
        decipher.setAuthTag(Buffer.from(tagB64!, 'base64'))
        return Buffer.concat([
          decipher.update(Buffer.from(ctB64!, 'base64')),
          decipher.final(),
        ]).toString('utf8')
      } catch {
        return null
      }
    },
  }
}

const webhookBox = createSecretBox('the-box/webhook-secret/v1')

/** App-settings box (secret settings in `app_settings`). */
export const appSettingSecretBox = createSecretBox('the-box/app-setting/v1')

export function encryptSecret(plaintext: string): string {
  return webhookBox.encrypt(plaintext)
}

export function decryptSecret(encoded: string): string | null {
  return webhookBox.decrypt(encoded)
}
