/**
 * Ports for the generic app-settings store
 * (domain/services/app-settings.service.ts).
 */

/** One stored row. A missing row means "use the code default". */
export interface AppSettingRow {
  key: string
  /** Non-secret value as parsed JSON. */
  value: unknown
  /** Encrypted secret (never plaintext). */
  secretCiphertext: string | null
  updatedBy: string | null
  updatedAt: Date
}

export interface AppSettingsRepository {
  findAll(): Promise<AppSettingRow[]>
  upsert(row: {
    key: string
    value: unknown
    secretCiphertext: string | null
    updatedBy: string | null
  }): Promise<void>
  delete(key: string): Promise<void>
}

/** Authenticated encryption for secret settings. `decrypt` returns null on failure. */
export interface SecretCipher {
  encrypt(plaintext: string): string
  decrypt(ciphertext: string): string | null
}
