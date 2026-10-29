export interface AppSettingRow {
  key: string
  value: unknown
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

export interface SecretCipher {
  encrypt(plaintext: string): string
  decrypt(ciphertext: string): string | null
}
