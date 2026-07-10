import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildGeoGamersDailyCopy } from './geogamers-daily-push-copy.js'

describe('buildGeoGamersDailyCopy', () => {
  it('returns French copy by default', () => {
    const { title, body } = buildGeoGamersDailyCopy('fr')
    assert.match(title, /GeoGamers/)
    assert.match(title, /panorama/i)
    assert.ok(body.includes('200'))
  })

  it('returns English copy for en', () => {
    const { title, body } = buildGeoGamersDailyCopy('en')
    assert.match(title, /GeoGamers/)
    assert.match(body, /200 points/)
  })
})
