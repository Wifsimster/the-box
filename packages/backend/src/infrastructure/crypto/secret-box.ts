import crypto from 'node:crypto'
import { env } from '../../config/env.js'

const PARTS = 3

export interface SecretBox {
  encrypt(plaintext: string): string
  decrypt(encoded: string): string | null
}

export function createSecretBox(info: string, secret: string = env.BETTER_AUTH_SECRET): SecretBox {
  const key = Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), Buffer.from(info), 32),
  )

  return {
    encrypt(plaintext: string): string {
      const iv = crypto.randomBytes(12)
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

export const appSettingSecretBox = createSecretBox('the-box/app-setting/v1')

export function encryptSecret(plaintext: string): string {
  return webhookBox.encrypt(plaintext)
}

export function decryptSecret(encoded: string): string | null {
  return webhookBox.decrypt(encoded)
}
