import { isCountryCode, type CountryCode } from '@the-box/types'

export type CountryInput = { ok: true; country: CountryCode | null } | { ok: false }

/**
 * Parses the `country` field of PUT /api/user/profile. `null` or `''` clears
 * the country; a string must be an ISO 3166-1 alpha-2 code from
 * COUNTRY_CODES (case-insensitive). Anything else is rejected.
 */
export function parseCountryInput(value: unknown): CountryInput {
  if (value === null || value === '') return { ok: true, country: null }
  if (typeof value !== 'string') return { ok: false }
  const code = value.trim().toUpperCase()
  return isCountryCode(code) ? { ok: true, country: code } : { ok: false }
}
