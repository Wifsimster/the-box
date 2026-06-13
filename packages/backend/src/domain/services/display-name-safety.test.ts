import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isDisplayNameSafe } from './display-name-safety.js'

describe('isDisplayNameSafe', () => {
  it('accepts ordinary display names', () => {
    for (const name of ['PixelHero', 'Marie-Claire', 'xX_Gamer_Xx', 'José', '日本語']) {
      assert.equal(isDisplayNameSafe(name), true, `expected safe: ${name}`)
    }
  })

  it('rejects empty / whitespace / nullish', () => {
    assert.equal(isDisplayNameSafe(''), false)
    assert.equal(isDisplayNameSafe('   '), false)
    assert.equal(isDisplayNameSafe(null), false)
    assert.equal(isDisplayNameSafe(undefined), false)
  })

  it('rejects profanity regardless of case', () => {
    assert.equal(isDisplayNameSafe('FuCkER'), false)
    assert.equal(isDisplayNameSafe('grosse merde'), false)
  })

  it('rejects accented slurs after diacritic stripping', () => {
    // "enculé" → normalized "encule" hits the blocklist.
    assert.equal(isDisplayNameSafe('Enculé'), false)
  })

  it('rejects brand / authority impersonation', () => {
    assert.equal(isDisplayNameSafe('admin'), false)
    assert.equal(isDisplayNameSafe('TheBox Official'), false)
    assert.equal(isDisplayNameSafe('support'), false)
  })

  it('rejects names containing links', () => {
    assert.equal(isDisplayNameSafe('visit evil.com'), false)
    assert.equal(isDisplayNameSafe('http://x'), false)
  })

  it('rejects absurdly long names', () => {
    assert.equal(isDisplayNameSafe('a'.repeat(41)), false)
  })
})
