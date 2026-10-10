import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { COUNTRY_CODES as CANONICAL } from '@the-box/types'
import { COUNTRY_CODES, countryName, sortedCountryOptions } from './countries'

describe('country list mirror', () => {
  test('matches @the-box/types exactly', () => {
    assert.deepEqual([...COUNTRY_CODES], [...CANONICAL])
  })

  test('holds the 249 ISO 3166-1 alpha-2 codes, unique', () => {
    assert.equal(COUNTRY_CODES.length, 249)
    assert.equal(new Set(COUNTRY_CODES).size, 249)
    for (const code of COUNTRY_CODES) assert.match(code, /^[A-Z]{2}$/)
  })
})

describe('countryName', () => {
  test('localises FR and EN', () => {
    assert.equal(countryName('DE', 'fr'), 'Allemagne')
    assert.equal(countryName('DE', 'en'), 'Germany')
  })

  test('falls back to the code on a bad locale', () => {
    assert.equal(countryName('FR', '!!'), 'FR')
  })
})

describe('sortedCountryOptions', () => {
  test('sorts by localised name', () => {
    const fr = sortedCountryOptions('fr').map((o) => o.name)
    assert.ok(fr.indexOf('Allemagne') < fr.indexOf('France'))
    assert.equal(fr.length, 249)
  })
})
