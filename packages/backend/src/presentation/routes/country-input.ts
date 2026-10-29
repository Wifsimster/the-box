import { isCountryCode, type CountryCode } from '@the-box/types'

export type CountryInput = { ok: true; country: CountryCode | null } | { ok: false }

export function parseCountryInput(value: unknown): CountryInput {
  if (value === null || value === '') return { ok: true, country: null }
  if (typeof value !== 'string') return { ok: false }
  const code = value.trim().toUpperCase()
  return isCountryCode(code) ? { ok: true, country: code } : { ok: false }
}
