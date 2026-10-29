import { db } from '../database/connection.js'
import type { AppSettingRow, AppSettingsRepository } from '../../domain/ports/app-settings.js'

const TABLE = 'app_settings'

interface Row {
  key: string
  value: unknown
  secret_ciphertext: string | null
  updated_by: string | null
  updated_at: Date | string
}

export const appSettingsRepository: AppSettingsRepository = {
  async findAll(): Promise<AppSettingRow[]> {
    const rows = await db(TABLE).select<Row[]>('key', 'value', 'secret_ciphertext', 'updated_by', 'updated_at')
    return rows.map((r) => ({
      key: r.key,
      value: r.value,
      secretCiphertext: r.secret_ciphertext,
      updatedBy: r.updated_by,
      updatedAt: new Date(r.updated_at),
    }))
  },

  async upsert({ key, value, secretCiphertext, updatedBy }): Promise<void> {
    const row = {
      key,
      value: value === null || value === undefined ? null : JSON.stringify(value),
      secret_ciphertext: secretCiphertext,
      updated_by: updatedBy,
      updated_at: db.fn.now(),
    }
    await db(TABLE).insert(row).onConflict('key').merge(['value', 'secret_ciphertext', 'updated_by', 'updated_at'])
  },

  async delete(key: string): Promise<void> {
    await db(TABLE).where('key', key).del()
  },
}
