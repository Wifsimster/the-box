import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { LEADERBOARD_IP_CAP as CANONICAL_CAP } from '@the-box/types'
import { LEADERBOARD_IP_CAP } from './leaderboardIpCap'

// The per-connection leaderboard cap message (game.sharedConnectionNotice).
// docs/brand.md: the `game` section says "tu", the English carries the same
// voice, and the base sentence carries no emoji.

const here = path.dirname(fileURLToPath(import.meta.url))
const locales = path.resolve(here, '../../public/locales')

function notice(lang: 'fr' | 'en'): string {
  const json = JSON.parse(readFileSync(path.join(locales, lang, 'translation.json'), 'utf-8'))
  return json.game.sharedConnectionNotice as string
}

const render = (s: string) => s.replace('{{cap}}', String(LEADERBOARD_IP_CAP))
const EMOJI = /\p{Extended_Pictographic}/u

describe('game.sharedConnectionNotice', () => {
  test('the frontend cap mirrors the backend cap', () => {
    assert.equal(LEADERBOARD_IP_CAP, CANONICAL_CAP)
  })

  for (const lang of ['fr', 'en'] as const) {
    test(`${lang}: exists, quotes the cap and has no emoji`, () => {
      const text = notice(lang)
      assert.ok(text.includes('{{cap}}'))
      assert.ok(render(text).startsWith(`${LEADERBOARD_IP_CAP} `))
      assert.doesNotMatch(text, EMOJI)
    })
  }

  test('fr: tutoie and explains the shared-connection case', () => {
    const text = notice('fr')
    assert.match(text, /\b(tu|ta|ton)\b/i)
    assert.doesNotMatch(text, /\b(vous|votre|vos)\b/i)
    assert.match(text, /réseau partagé/)
    assert.match(text, /hors classement/)
  })

  test('en: explains the shared-connection case without apologising', () => {
    const text = notice('en')
    assert.match(text, /shared network/)
    assert.match(text, /off the leaderboard/)
    assert.doesNotMatch(text, /sorry|oops/i)
  })
})
