import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMaskedTitle,
  maxRevealableLetters,
  effectiveMaxReveals,
  revealedFragment,
  penaltyPctForReveals,
  nextPenaltyPct,
  LETTER_PENALTY_STEPS,
} from './letter-reveal.service.js'
import { createFuzzyMatchService } from './fuzzy-match.service.js'
import type { DomainLogger } from '../ports/logger.js'

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('letter-reveal masking', () => {
  it('zero reveals shows the free skeleton: word lengths, spaces, digits, punctuation', () => {
    assert.equal(buildMaskedTitle('Elden Ring', 0), '_____ ____')
    assert.equal(buildMaskedTitle('Portal 2', 0), '______ 2')
    assert.equal(buildMaskedTitle('NieR:Automata', 0), '____:________')
  })

  it('reveals letters left-to-right, skipping structural characters', () => {
    assert.equal(buildMaskedTitle('Elden Ring', 1), 'E____ ____')
    assert.equal(buildMaskedTitle('Elden Ring', 2), 'El___ ____')
    assert.equal(buildMaskedTitle('Portal 2', 1), 'P_____ 2')
  })

  it('shows a leading article for free without consuming a reveal', () => {
    // "The" is free; the first PAID letter is the W of Witcher.
    assert.equal(buildMaskedTitle('The Witcher 3: Wild Hunt', 0), 'The _______ 3: ____ ____')
    assert.equal(buildMaskedTitle('The Witcher 3: Wild Hunt', 1), 'The W______ 3: ____ ____')
    // French article too.
    assert.equal(buildMaskedTitle('La Mulana', 1), 'La M_____')
  })

  it('only treats a leading article as free when followed by a space', () => {
    // "Anthem" starts with "An" but is not the article "An".
    assert.equal(buildMaskedTitle('Anthem', 0), '______')
  })

  it('preserves diacritics in revealed characters', () => {
    assert.equal(buildMaskedTitle('Éternel', 1), 'É______')
  })

  it('is idempotent and clamps the count to the cap', () => {
    const at = (n: number) => buildMaskedTitle('Elden Ring', n)
    assert.equal(at(2), at(2))
    // Counts beyond the cap can never widen the leak.
    assert.equal(at(99), at(maxRevealableLetters('Elden Ring')))
  })

  it('static bound caps reveals at min(2, ceil(maskable × 0.3))', () => {
    assert.equal(maxRevealableLetters('Ico'), 1) // 3 maskable
    assert.equal(maxRevealableLetters('Doom'), 2) // 4 maskable
    assert.equal(maxRevealableLetters('Elden Ring'), 2) // 9 maskable
    assert.equal(maxRevealableLetters('The Witcher 3: Wild Hunt'), 2)
  })

  it('digit-only titles mask their digits instead of printing the answer', () => {
    assert.equal(buildMaskedTitle('2048', 0), '____')
    assert.equal(buildMaskedTitle('2048', 1), '2___')
    assert.equal(maxRevealableLetters('2048'), 2)
  })

  it('penalty schedule is convex: 15% then +20%', () => {
    assert.equal(penaltyPctForReveals(0), 0)
    assert.equal(penaltyPctForReveals(1), 15)
    assert.equal(penaltyPctForReveals(2), 35)
    assert.equal(nextPenaltyPct(2, 0), LETTER_PENALTY_STEPS[0])
    assert.equal(nextPenaltyPct(2, 1), LETTER_PENALTY_STEPS[1])
    assert.equal(nextPenaltyPct(2, 2), null)
    // Single-reveal title hits the cap after one letter.
    assert.equal(nextPenaltyPct(1, 1), null)
  })
})

// ---------------------------------------------------------------------------
// SHIP GATE — the reveal cap is verified against the SAME fuzzy matcher that
// scores guesses (effectiveMaxReveals), so the revealed prefix can never
// satisfy it on its own. These tests pin the property on a representative
// corpus AND document the leaks the static formula alone would have allowed
// ("Do" → "Doom", the free article in "La Mu" → "La Mulana"). If a masking
// change makes any of these pass, the feature leaks answers and must not ship.
// ---------------------------------------------------------------------------
describe('letter-reveal × fuzzy-match safety (ship gate)', () => {
  const fuzzy = createFuzzyMatchService({ logger: silentLogger })
  // Any credit is a leak: a revealed fragment worth even a partial match
  // would solve the position at 40%.
  const isMatch = (input: string, name: string) => fuzzy.evaluateMatch(input, name).matched

  // Representative shapes: short, long, articled, numbered, subtitled,
  // diacritics, colon-joined, expansion-suffixed, single-word, digit-only.
  const corpus = [
    'Ico',
    'Doom',
    'Limbo',
    'Hades',
    'Portal 2',
    'Elden Ring',
    'Dark Souls III',
    'The Witcher 3: Wild Hunt',
    'The Last of Us',
    'Grand Theft Auto V',
    'NieR:Automata',
    'Pokémon Red',
    'La Mulana',
    'Half-Life 2: Episode Two',
    'Warhammer 40,000: Dawn of War - Dark Crusade',
    'A Space for the Unbound',
    'Resident Evil 4',
    'Sid Meier’s Civilization VI',
    '2048',
  ]

  it('every fragment up to the effective cap never earns any credit on its own title', () => {
    for (const title of corpus) {
      const max = effectiveMaxReveals(title, isMatch)
      for (let n = 0; n <= max; n++) {
        const fragment = revealedFragment(title, n)
        if (fragment === '') continue
        assert.equal(
          fuzzy.evaluateMatch(fragment, title).precision,
          'none',
          `leak: "${fragment}" (reveals=${n}) must NOT match "${title}"`
        )
      }
    }
  })

  it('the free skeleton (digits, years, punctuation) earns nothing', () => {
    // Digits and years ship for free with the first paid reveal, so a
    // number alone can never be worth even partial credit.
    for (const title of ['God of War (2018)', 'Battlefield 1942', 'Portal 2', 'Kingdom Hearts 358/2 Days']) {
      const skeleton = revealedFragment(title, 0)
      assert.equal(
        fuzzy.evaluateMatch(skeleton, title).precision,
        'none',
        `leak: skeleton "${skeleton}" must NOT match "${title}"`
      )
    }
  })

  it('shrinks the cap where the static formula would leak', () => {
    // Two letters plus the free digit spell the acronym "Re 4", which the
    // matcher reads as "Resident Evil 4": static says 2, the matcher-
    // verified cap must stop at 1.
    assert.equal(maxRevealableLetters('Resident Evil 4'), 2)
    assert.equal(effectiveMaxReveals('Resident Evil 4', isMatch), 1)
    // "Bi" is the acronym of "BioShock Infinite" (partial credit).
    assert.equal(effectiveMaxReveals('BioShock Infinite', isMatch), 1)
    // Word-level matching no longer lets a two-letter prefix match a short
    // title ("Do" is not "Doom", "La M" is not "La Mulana"), so these keep
    // their full static cap.
    assert.equal(effectiveMaxReveals('Doom', isMatch), 2)
    assert.equal(effectiveMaxReveals('La Mulana', isMatch), 2)
  })

  it('still grants at least one letter on typical titles (helpfulness)', () => {
    for (const title of corpus) {
      assert.ok(
        effectiveMaxReveals(title, isMatch) >= 1,
        `"${title}" should allow at least one reveal`
      )
    }
  })

  it('the masked string itself (underscores included) never earns any credit', () => {
    for (const title of corpus) {
      const max = effectiveMaxReveals(title, isMatch)
      const masked = buildMaskedTitle(title, max)
      assert.equal(
        fuzzy.evaluateMatch(masked, title).precision,
        'none',
        `leak: masked "${masked}" must NOT match "${title}"`
      )
    }
  })
})
