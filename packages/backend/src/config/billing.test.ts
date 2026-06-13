import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BILLING_CATALOG, getCatalogEntry } from './billing.js'

describe('BILLING_CATALOG', () => {
  it('exposes every tier with a unique lookup_key', () => {
    const lookupKeys = BILLING_CATALOG.map((e) => e.lookupKey)
    assert.equal(new Set(lookupKeys).size, lookupKeys.length, 'lookup_keys must be unique')
    const tiers = BILLING_CATALOG.map((e) => e.tier)
    assert.equal(new Set(tiers).size, tiers.length, 'tiers must be unique')
  })

  it('charges a positive EUR amount for every entry', () => {
    for (const entry of BILLING_CATALOG) {
      assert.equal(entry.currency, 'eur', `${entry.tier} must be priced in EUR`)
      assert.ok(entry.unitAmount > 0, `${entry.tier} must have a positive amount`)
    }
  })

  it('offers a one-time supporter_lifetime tier (interval=null → checkout mode "payment")', () => {
    const supporter = getCatalogEntry('supporter_lifetime')
    assert.ok(supporter, 'supporter_lifetime must be in the catalog')
    assert.equal(supporter.interval, null, 'supporter_lifetime must be one-time')
    assert.equal(supporter.lookupKey, 'the_box_supporter_lifetime')
  })

  it('keeps the recurring tiers recurring', () => {
    assert.equal(getCatalogEntry('premium_monthly')?.interval, 'month')
    assert.equal(getCatalogEntry('premium_annual')?.interval, 'year')
  })
})
