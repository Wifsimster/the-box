import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseCountryInput } from './country-input.js'

describe('parseCountryInput', () => {
  it('accepts an ISO 3166-1 alpha-2 code, case-insensitive', () => {
    assert.deepEqual(parseCountryInput('FR'), { ok: true, country: 'FR' })
    assert.deepEqual(parseCountryInput(' be '), { ok: true, country: 'BE' })
  })

  it('clears the country with null or an empty string', () => {
    assert.deepEqual(parseCountryInput(null), { ok: true, country: null })
    assert.deepEqual(parseCountryInput(''), { ok: true, country: null })
  })

  it('rejects unknown codes, alpha-3 codes and non-strings', () => {
    assert.deepEqual(parseCountryInput('XX'), { ok: false })
    assert.deepEqual(parseCountryInput('FRA'), { ok: false })
    assert.deepEqual(parseCountryInput('EU'), { ok: false })
    assert.deepEqual(parseCountryInput(33), { ok: false })
    assert.deepEqual(parseCountryInput({}), { ok: false })
  })
})
