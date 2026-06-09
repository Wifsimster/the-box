import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEveningNudge,
  truncateDisplayName,
} from './evening-nudge-copy.js'

describe('buildEveningNudge', () => {
  it('named leader (fr) interpolates name + grouped score and stays gender-neutral', () => {
    const { title, body } = buildEveningNudge('fr', {
      leaderName: 'PixelHero',
      leaderScore: 4820,
    })
    assert.match(title, /défi du jour/)
    assert.ok(body.includes('PixelHero'))
    // FR groups thousands with a narrow no-break space (U+202F); match any separator.
    assert.match(body, /4\s820/, `expected grouped score, got: ${body}`)
    // No gendered past-participle agreement on the player.
    assert.doesNotMatch(body, /détrôné|battu·e|le coiffer/)
  })

  it('named leader (en) interpolates name + comma-grouped score', () => {
    const { body } = buildEveningNudge('en', {
      leaderName: 'PixelHero',
      leaderScore: 12345,
    })
    assert.ok(body.includes('PixelHero'))
    assert.ok(body.includes('12,345'))
    assert.ok(/lead/i.test(body))
  })

  it('anon leader (name null) uses score-only copy and never an empty name slot', () => {
    const fr = buildEveningNudge('fr', { leaderName: null, leaderScore: 900 })
    assert.ok(fr.body.includes('900'))
    assert.doesNotMatch(fr.body, /null|undefined/)
    assert.doesNotMatch(fr.body, /\bmène\b/) // not the named-leader phrasing

    const en = buildEveningNudge('en', { leaderName: null, leaderScore: 900 })
    assert.ok(en.body.includes('900'))
    assert.ok(/top score/i.test(en.body))
  })

  it('empty board (score null) tells the recipient to be the first', () => {
    const fr = buildEveningNudge('fr', { leaderName: null, leaderScore: null })
    assert.ok(/première personne|premier/i.test(fr.body))

    const en = buildEveningNudge('en', { leaderName: null, leaderScore: null })
    assert.ok(/be the first/i.test(en.body))
  })

  it('empty board ignores a stray name when there is no score', () => {
    const { body } = buildEveningNudge('fr', { leaderName: 'Ghost', leaderScore: null })
    assert.doesNotMatch(body, /Ghost/)
  })
})

describe('truncateDisplayName', () => {
  it('passes short names through untouched', () => {
    assert.equal(truncateDisplayName('PixelHero'), 'PixelHero')
  })

  it('ellipsizes names longer than the cap', () => {
    const out = truncateDisplayName('A'.repeat(40))
    assert.ok(out.endsWith('…'))
    assert.ok(out.length <= 20)
  })

  it('trims surrounding whitespace', () => {
    assert.equal(truncateDisplayName('  Neo  '), 'Neo')
  })
})
