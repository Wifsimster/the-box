import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createFuzzyMatchService } from './fuzzy-match.service.js'
import type { DomainLogger } from '../ports/logger.js'

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
}

const service = createFuzzyMatchService({ logger: silentLogger })

function expectMatch(input: string, gameName: string, aliases: string[] = []): void {
  assert.equal(
    service.isMatch(input, gameName, aliases),
    true,
    `expected "${input}" to match "${gameName}"`
  )
}

function expectNoMatch(input: string, gameName: string, aliases: string[] = []): void {
  assert.equal(
    service.isMatch(input, gameName, aliases),
    false,
    `expected "${input}" NOT to match "${gameName}"`
  )
}

describe('fuzzy-match.service', () => {
  describe('screenshot cases — guesses that must NOT match', () => {
    // The user surfaced "garage band" → "Xenoblade Chronicles 3D" with an
    // arrow. Two unrelated short tokens were the smoking gun, so the hard
    // floor below picks it up first.
    it('rejects "garage band" for "Xenoblade Chronicles 3D"', () => {
      expectNoMatch('garage band', 'Xenoblade Chronicles 3D')
    })

    it('rejects "mario madness" for "The World Ends With You DS"', () => {
      expectNoMatch('mario madness', 'The World Ends With You DS')
    })

    it('rejects "aliens" for "Ground Control"', () => {
      expectNoMatch('aliens', 'Ground Control')
    })

    it('rejects "loco roco 2" for "Tiny Wings"', () => {
      expectNoMatch('loco roco 2', 'Tiny Wings')
    })

    it('rejects "sim city 3000" for "Command & Conquer: Red Alert 2 - Yuri\'s Revenge"', () => {
      expectNoMatch('sim city 3000', "Command & Conquer: Red Alert 2 - Yuri's Revenge")
    })
  })

  describe('screenshot cases — guesses that should match', () => {
    it('accepts exact normalised guess', () => {
      expectMatch('Tomb raider', 'Tomb Raider')
      expectMatch('tiny wings', 'Tiny Wings')
    })

    it('accepts plural typos', () => {
      expectMatch('plant vs zombies', 'Plants vs. Zombies')
      expectMatch('plants vs zombies', 'Plants vs. Zombies')
    })

    it('accepts base-franchise guess for expansion-shaped titles', () => {
      expectMatch('command and conquers', "Command & Conquer: Red Alert 2 - Yuri's Revenge")
    })

    // New behaviour: token-sort path lets natural word reorders through
    // without requiring a hand-tuned alias.
    it('accepts word-reordered franchise + subtitle ("total war rome" ↔ "ROME: Total War")', () => {
      expectMatch('total war rome', 'ROME: Total War')
      expectMatch('rome total war', 'Total War: ROME')
    })
  })

  describe('token-sort match (word-order tolerance)', () => {
    it('matches when input is a permutation of the target', () => {
      expectMatch('hunt wild the witcher 3', 'The Witcher 3: Wild Hunt')
      expectMatch('conquer command', 'Command & Conquer')
    })

    it('does not bypass series-number guard via token-sort', () => {
      expectNoMatch('witcher 2 wild hunt', 'The Witcher 3: Wild Hunt')
    })
  })

  describe('hard rejection floor (no meaningful token overlap)', () => {
    it('rejects fully unrelated guesses even when JW is non-zero', () => {
      // JW("garage band", "xenoblade chronicles 3d") ≈ 0.48 — the floor only
      // fires once we confirm no input token of length ≥3 overlaps the
      // target tokens.
      expectNoMatch('garage band', 'Xenoblade Chronicles 3D')
      expectNoMatch('hello world', 'Final Fantasy VII')
    })

    it('does not fire when input shares a meaningful token with target', () => {
      // "halflife" is a substring of "halflife 2", so the floor must defer
      // to the structural rules (which then reject this as an incomplete
      // base name).
      expectNoMatch('half-life', 'Half-Life 2: Episode Two')
    })
  })

  describe('subtitle-only matching (regression: previously broken)', () => {
    it('accepts "Skyrim" for "The Elder Scrolls V: Skyrim"', () => {
      expectMatch('skyrim', 'The Elder Scrolls V: Skyrim')
    })

    it('accepts full title with stop-prefix', () => {
      expectMatch('the elder scrolls v skyrim', 'The Elder Scrolls V: Skyrim')
    })
  })

  describe('series number guards (no regressions)', () => {
    it('rejects franchise-only guess when target has a series number ("Witcher" → "Witcher 3: Wild Hunt")', () => {
      expectNoMatch('witcher', 'The Witcher 3: Wild Hunt')
    })

    it('rejects "portal" for "Portal 2"', () => {
      expectNoMatch('portal', 'Portal 2')
    })

    it('rejects "fallout" for "Fallout 2"', () => {
      expectNoMatch('fallout', 'Fallout 2')
    })

    it('rejects mismatched series numbers', () => {
      expectNoMatch('witcher 2', 'The Witcher 3: Wild Hunt')
    })

    it('accepts matching base + number ("Witcher 3" → "The Witcher 3: Wild Hunt")', () => {
      expectMatch('witcher 3', 'The Witcher 3: Wild Hunt')
      expectMatch('the witcher 3', 'The Witcher 3: Wild Hunt')
      expectMatch('half-life 2', 'Half-Life 2: Episode Two')
    })
  })

  describe('DLC handling (no regressions)', () => {
    it('rejects base-name-only guess for explicit DLC titles', () => {
      expectNoMatch('cuphead', 'Cuphead: The Delicious Last Course')
    })

    it('allows base-name guess for main games with subtitle', () => {
      expectMatch('paper mario', 'Paper Mario: The Thousand-Year Door')
    })
  })

  describe('alias matching', () => {
    it('accepts a typed alias', () => {
      expectMatch('cs go', 'Counter-Strike: Global Offensive', ['CS:GO', 'csgo'])
    })

    it('accepts a permutation of an alias via token-sort', () => {
      expectMatch('go counter strike', 'Counter-Strike: Global Offensive', ['counter strike go'])
    })
  })

  describe('parenthesised alternate names (screenshot regression)', () => {
    // Screenshot: "farenheit" was typed for "Fahrenheit (Indigo Prophecy)"
    // and rejected because the parenthesised regional name dragged the
    // full-string JW down from ~0.91 (vs "Fahrenheit") to ~0.77.
    it('accepts a one-letter typo of the base name', () => {
      expectMatch('farenheit', 'Fahrenheit (Indigo Prophecy)')
    })

    it('accepts the exact base name', () => {
      expectMatch('Fahrenheit', 'Fahrenheit (Indigo Prophecy)')
    })

    it('accepts the parenthesised alternate name', () => {
      expectMatch('Indigo Prophecy', 'Fahrenheit (Indigo Prophecy)')
    })

    it('still rejects unrelated guesses against parenthesised titles', () => {
      expectNoMatch('max payne', 'Fahrenheit (Indigo Prophecy)')
      expectNoMatch('max payne 3', 'Fahrenheit (Indigo Prophecy)')
    })
  })

  describe('expansion-suffix titles (screenshot regression)', () => {
    // Screenshot: the challenge "Warhammer 40,000: Dawn of War - Dark Crusade"
    // rejected both base-game guesses. The expansion suffix and the comma'd
    // franchise number must both be optional.
    it('accepts the base game for an expansion-suffixed title', () => {
      expectMatch('Warhammer dawn of war', 'Warhammer 40,000: Dawn of War - Dark Crusade')
      expectMatch('Warhammer 40000 dawn of war', 'Warhammer 40,000: Dawn of War - Dark Crusade')
    })

    it('accepts the full expansion title', () => {
      expectMatch(
        'warhammer 40000 dawn of war dark crusade',
        'Warhammer 40,000: Dawn of War - Dark Crusade'
      )
    })

    it('still rejects an unrelated guess for an expansion-suffixed title', () => {
      expectNoMatch('sim city 3000', "Command & Conquer: Red Alert 2 - Yuri's Revenge")
    })

    it('reads a comma-grouped franchise number as flavour, not a sequel number', () => {
      assert.equal(service.parseGameTitle('Warhammer 40,000').seriesNumber, null)
    })
  })

  // Live session against "Grand Theft Auto: Vice City" surfaced two bugs:
  // (A) "grand thief auto 3" was accepted (+125, wrong — that's GTA III);
  // (B) "gta vice city" was rejected. Fix A adds a guard in the base-name
  // path; Fix B adds derived-acronym expansion. These tests pin both.
  describe('GTA series — acronym + numbered ambiguity', () => {
    describe('target: "Grand Theft Auto: Vice City"', () => {
      const target = 'Grand Theft Auto: Vice City'

      it('accepts subtitle-only "vice city"', () => {
        expectMatch('vice city', target)
      })

      it('accepts acronym + subtitle "gta vice city" (Fix B)', () => {
        expectMatch('gta vice city', target)
      })

      it('accepts full title "grand theft auto vice city"', () => {
        expectMatch('grand theft auto vice city', target)
      })

      it('accepts full title with colon', () => {
        expectMatch('grand theft auto: vice city', target)
      })

      it('accepts per-game alias "gta vc"', () => {
        expectMatch('gta vc', target, ['gta vc', 'vc'])
      })

      it('rejects bare acronym "gta" (ambiguous)', () => {
        expectNoMatch('gta', target)
      })

      it('rejects "gta 3" — player means GTA III (Fix A via acronym expansion)', () => {
        expectNoMatch('gta 3', target)
      })

      it('rejects "grand thief auto 3" — wrong number + misspelling (Fix A, original bug)', () => {
        expectNoMatch('grand thief auto 3', target)
      })

      it('rejects "gta 5" — player means GTA V', () => {
        expectNoMatch('gta 5', target)
      })

      it('rejects "san andreas" — different game\'s subtitle', () => {
        expectNoMatch('san andreas', target)
      })

      it('rejects "Grand Theft Auto V" (Fix A)', () => {
        expectNoMatch('Grand Theft Auto V', target)
      })
    })

    describe('target: "Grand Theft Auto V"', () => {
      const target = 'Grand Theft Auto V'

      it('accepts "gta 5" — arabic↔roman via acronym expansion', () => {
        expectMatch('gta 5', target)
      })

      it('accepts "gta v" — roman via acronym expansion', () => {
        expectMatch('gta v', target)
      })

      it('accepts "grand theft auto 5"', () => {
        expectMatch('grand theft auto 5', target)
      })

      it('rejects "gta vice city" — different entry', () => {
        expectNoMatch('gta vice city', target)
      })

      it('rejects subtitle-only "vice city"', () => {
        expectNoMatch('vice city', target)
      })
    })

    describe('target: "Grand Theft Auto: San Andreas"', () => {
      const target = 'Grand Theft Auto: San Andreas'

      it('accepts subtitle-only "san andreas"', () => {
        expectMatch('san andreas', target)
      })

      it('accepts "gta san andreas" (Fix B)', () => {
        expectMatch('gta san andreas', target)
      })

      it('accepts per-game alias "gta sa"', () => {
        expectMatch('gta sa', target, ['gta sa', 'sa'])
      })

      it('accepts one-token typo "grand thieves auto san andreas"', () => {
        expectMatch('grand thieves auto san andreas', target)
      })

      it('rejects "gta 3" — wrong entry', () => {
        expectNoMatch('gta 3', target)
      })

      it('rejects "vice city" — different subtitle', () => {
        expectNoMatch('vice city', target)
      })
    })
  })
})
