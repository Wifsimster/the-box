import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DESCRIBE_DISTRACTOR_COUNT,
  DESCRIBE_RELATED_MAX,
  DESCRIBE_SAME_SERIES_MAX,
  DescribeGuessError,
  candidateLabel,
  createDescribeGuessService,
  isAccepted,
  parseVerdict,
  selectCandidates,
  titlePrefilterHit,
  type CandidatePools,
  type DescribeAttemptPort,
  type DescribeClaim,
  type DescribeEvaluation,
  type DescribeSessionPort,
  type DescribeTierSession,
} from './describe-guess.service.js'
import { createFuzzyMatchService } from './fuzzy-match.service.js'
import {
  DescribeJudgeError,
  type DescribeGameSheet,
  type DescribeJudge,
  type DescribeJudgeInput,
} from '../ports/describe-judge.js'
import { silentLogger } from '../ports/logger.test-double.js'

const fuzzy = createFuzzyMatchService({ logger: silentLogger })

function sheet(id: number, name: string, extra: Partial<DescribeGameSheet> = {}): DescribeGameSheet {
  return {
    id,
    name,
    aliases: [],
    releaseYear: 2000,
    developer: 'Dev',
    publisher: 'Pub',
    genres: ['Action'],
    platforms: ['PC'],
    ...extra,
  }
}

/** Deterministic PRNG (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TARGET = sheet(1, 'Super Mario Galaxy', { genres: ['Platformer'] })

function bigPools(): CandidatePools {
  return {
    sameSeries: Array.from({ length: 8 }, (_, i) => sheet(100 + i, `Super Mario ${i}`)),
    sameGenre: Array.from({ length: 20 }, (_, i) => sheet(200 + i, `Platformer ${i}`)),
    random: Array.from({ length: 40 }, (_, i) => sheet(300 + i, `Random ${i}`)),
  }
}

describe('selectCandidates', () => {
  it('returns the target plus 10 distinct distractors', () => {
    const out = selectCandidates(TARGET, bigPools(), seeded(1))
    assert.equal(out.length, DESCRIBE_DISTRACTOR_COUNT + 1)
    assert.equal(out.filter((g) => g.id === TARGET.id).length, 1)
    assert.equal(new Set(out.map((g) => g.id)).size, out.length)
  })

  it('caps related distractors so the target is not the centroid', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const out = selectCandidates(TARGET, bigPools(), seeded(seed))
      const series = out.filter((g) => g.id >= 100 && g.id < 200).length
      const genre = out.filter((g) => g.id >= 200 && g.id < 300).length
      const random = out.filter((g) => g.id >= 300).length
      assert.ok(series <= DESCRIBE_SAME_SERIES_MAX, `series=${series}`)
      assert.ok(series + genre <= DESCRIBE_RELATED_MAX, `related=${series + genre}`)
      assert.ok(random >= DESCRIBE_DISTRACTOR_COUNT - DESCRIBE_RELATED_MAX, `random=${random}`)
    }
  })

  it('mixes related and random games when both exist', () => {
    const out = selectCandidates(TARGET, bigPools(), seeded(7))
    assert.ok(out.some((g) => g.id >= 100 && g.id < 300), 'expected a related distractor')
    assert.ok(out.some((g) => g.id >= 300), 'expected a random distractor')
  })

  it('does not always put the target in the same slot', () => {
    const slots = new Set<number>()
    for (let seed = 1; seed <= 30; seed++) {
      slots.add(selectCandidates(TARGET, bigPools(), seeded(seed)).findIndex((g) => g.id === TARGET.id))
    }
    assert.ok(slots.size > 3, `target slots seen: ${[...slots].join(',')}`)
  })

  it('skips duplicates and games sharing the target name', () => {
    const pools: CandidatePools = {
      sameSeries: [sheet(2, 'Super Mario Galaxy'), sheet(3, 'Super Mario Galaxy 2')],
      sameGenre: [sheet(3, 'Super Mario Galaxy 2'), sheet(4, 'Rayman')],
      random: [sheet(1, 'Super Mario Galaxy'), sheet(5, 'Doom'), sheet(5, 'Doom')],
    }
    const out = selectCandidates(TARGET, pools, seeded(3))
    assert.deepEqual(out.map((g) => g.id).sort((a, b) => a - b), [1, 3, 4, 5])
  })

  it('tops up from related games when the catalogue is small', () => {
    const pools: CandidatePools = {
      sameSeries: [],
      sameGenre: Array.from({ length: 12 }, (_, i) => sheet(200 + i, `Platformer ${i}`)),
      random: [sheet(300, 'Random 0')],
    }
    const out = selectCandidates(TARGET, pools, seeded(5))
    assert.equal(out.length, DESCRIBE_DISTRACTOR_COUNT + 1)
  })
})

describe('titlePrefilterHit', () => {
  const candidates = [
    sheet(1, 'Hades'),
    sheet(2, 'Grand Theft Auto V', { aliases: ['GTA 5'] }),
    sheet(3, 'Super Mario Galaxy'),
    sheet(4, 'The Legend of Zelda: Ocarina of Time'),
  ]

  it('flags a description that names a candidate title', () => {
    assert.equal(titlePrefilterHit('on joue zagreus le fils de hades', candidates, fuzzy), true)
    assert.equal(titlePrefilterHit("zagreus qui s'echappe des enfers d'Hadès", candidates, fuzzy), true)
    assert.equal(titlePrefilterHit('je pense que c est super mario galaxy dans l espace', candidates, fuzzy), true)
  })

  it('flags an alias', () => {
    assert.equal(titlePrefilterHit('braquages a los santos, clairement gta 5', candidates, fuzzy), true)
  })

  it('flags a subtitle that names the entry on its own', () => {
    assert.equal(titlePrefilterHit('link qui joue de l ocarina of time', candidates, fuzzy), true)
  })

  it('does not flag a franchise word alone', () => {
    assert.equal(titlePrefilterHit('mario mais dans l espace avec des planetes', candidates, fuzzy), false)
    assert.equal(titlePrefilterHit('gta avec trois persos michael franklin trevor', candidates, fuzzy), false)
  })

  it('does not flag a description without any title', () => {
    assert.equal(titlePrefilterHit('un rpg japonais avec des epees et des cristaux', candidates, fuzzy), false)
  })

  it('stays fast on a 200-character description with 11 candidates', () => {
    const eleven = Array.from({ length: 11 }, (_, i) =>
      sheet(i, ['The Witcher 3: Wild Hunt', 'Dark Souls III', 'Hollow Knight', 'Final Fantasy X'][i % 4]!)
    )
    const text = 'un jeu ou on explore un grand monde ouvert avec des monstres et des quetes secondaires tres longues et un heros aux cheveux blancs qui chasse des creatures contre de l argent dans des villages'
    const t0 = performance.now()
    titlePrefilterHit(text.slice(0, 200), eleven, fuzzy)
    const ms = performance.now() - t0
    assert.ok(ms < 500, `prefilter took ${ms.toFixed(0)} ms`)
  })
})

describe('parseVerdict', () => {
  const labels = ['c01', 'c02', 'c03']

  it('picks the arg-max and normalises', () => {
    const v = parseVerdict({ game_id: 'c02', probabilities: { c01: 0.1, c02: 1.4, c03: 0.5 } }, labels)
    assert.equal(v.chosenLabel, 'c02')
    assert.ok(Math.abs(v.probability - 1.4 / 2.0) < 1e-9)
  })

  it('uses the probabilities, not the self-reported game_id', () => {
    const v = parseVerdict({ game_id: 'c01', probabilities: { c01: 0.2, c02: 0.1, c03: 0.7 } }, labels)
    assert.equal(v.chosenLabel, 'c03')
  })

  it('ignores negative, non-numeric and unknown entries', () => {
    const v = parseVerdict(
      { probabilities: { c01: -5, c02: 'lots', c03: 0.3, c99: 100 } },
      labels
    )
    assert.equal(v.chosenLabel, 'c03')
    assert.equal(v.probability, 1)
  })

  for (const [name, raw] of [
    ['null', null],
    ['a string', 'c01'],
    ['no probabilities', { game_id: 'c01' }],
    ['all zero', { probabilities: { c01: 0, c02: 0, c03: 0 } }],
  ] as const) {
    it(`rejects ${name} as invalid_output`, () => {
      assert.throws(
        () => parseVerdict(raw, labels),
        (e: unknown) => e instanceof DescribeJudgeError && e.code === 'invalid_output'
      )
    })
  }
})

describe('isAccepted', () => {
  it('accepts the target at or above 0.8 only', () => {
    assert.equal(isAccepted(1, 0.8, 1), true)
    assert.equal(isAccepted(1, 0.79, 1), false)
    assert.equal(isAccepted(2, 0.99, 1), false)
    assert.equal(isAccepted(null, null, 1), null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// evaluate / submit
// ─────────────────────────────────────────────────────────────────────────────

function judgeReturning(
  fn: (input: DescribeJudgeInput, signal: AbortSignal) => Promise<unknown>,
  model = 'test-model'
): DescribeJudge {
  return {
    model,
    async judge(input, signal) {
      return { raw: await fn(input, signal), inputTokens: 1200, outputTokens: 80 }
    },
  }
}

/** A judge that puts `p` on the candidate with game id `gameId`. */
function judgeChoosing(gameId: number, p: number): DescribeJudge {
  return judgeReturning(async (input) => {
    const probabilities: Record<string, number> = {}
    const others = (1 - p) / (input.candidates.length - 1)
    for (const c of input.candidates) probabilities[c.label] = c.sheet.id === gameId ? p : others
    return { game_id: 'x', probabilities }
  })
}

interface Harness {
  claims: DescribeClaim[]
  completed: Array<{ id: number; evaluation: DescribeEvaluation }>
  shifts: Array<{ tierSessionId: string; position: number; ms: number }>
  judgeCalls: number
}

function makeService(
  judge: DescribeJudge,
  overrides: {
    session?: Partial<DescribeTierSession> | null
    wrong?: boolean
    solved?: boolean
    claimResult?: number | null
    timeoutMs?: number
  } = {}
) {
  const h: Harness = { claims: [], completed: [], shifts: [], judgeCalls: 0 }
  const session: DescribeTierSession | null =
    overrides.session === null
      ? null
      : {
          user_id: 'u1',
          game_session_id: 'gs1',
          daily_challenge_id: 9,
          game_is_completed: false,
          ...overrides.session,
        }
  const sessions: DescribeSessionPort = {
    findTierSessionWithContext: async () => session,
    hasWrongGuessForPosition: async () => overrides.wrong ?? true,
    hasCorrectGuessForPosition: async () => overrides.solved ?? false,
    shiftRoundStart: async (tierSessionId, position, ms) => {
      h.shifts.push({ tierSessionId, position, ms })
    },
  }
  const attempts: DescribeAttemptPort = {
    findTargetSheet: async () => TARGET,
    findCandidatePools: async () => bigPools(),
    claim: async (claim) => {
      h.claims.push(claim)
      return overrides.claimResult === undefined ? 42 : overrides.claimResult
    },
    complete: async (id, evaluation) => {
      h.completed.push({ id, evaluation })
    },
  }
  const countingJudge: DescribeJudge = {
    model: judge.model,
    judge: (input, signal) => {
      h.judgeCalls++
      return judge.judge(input, signal)
    },
  }
  let clock = 1_000
  const service = createDescribeGuessService({
    judge: countingJudge,
    fuzzy,
    sessions,
    challenges: {
      findTiersByChallenge: async () => [{ id: 5 }],
      findScreenshotAtPosition: async (_tier, position) => (position === 3 ? { screenshot_id: 77 } : null),
    },
    attempts,
    logger: silentLogger,
    rng: seeded(11),
    now: () => (clock += 250),
    timeoutMs: overrides.timeoutMs ?? 5000,
  })
  return { service, h }
}

const VALID = {
  userId: 'u1',
  isGuest: false,
  tierSessionId: 'ts1',
  screenshotId: 77,
  position: 3,
  description: 'un plombier qui saute de planete en planete pour sauver la princesse',
  locale: 'fr' as const,
}

describe('describe-guess evaluate', () => {
  it('records an accepted verdict when the judge picks the target at >= 0.8', async () => {
    const { service } = makeService(judgeChoosing(TARGET.id, 0.92))
    const candidates = selectCandidates(TARGET, bigPools(), seeded(2))
    const ev = await service.evaluate({ description: VALID.description, locale: 'fr', target: TARGET, candidates })
    assert.equal(ev.error, null)
    assert.equal(ev.chosenGameId, TARGET.id)
    assert.ok(Math.abs(ev.probability! - 0.92) < 1e-9)
    assert.equal(ev.accepted, true)
    assert.equal(ev.inputTokens, 1200)
    assert.equal(ev.outputTokens, 80)
    assert.deepEqual(ev.candidateGameIds, candidates.map((c) => c.id))
  })

  it('records a rejected verdict when the judge picks another game', async () => {
    const { service } = makeService(judgeChoosing(300, 0.95))
    const candidates = [TARGET, sheet(300, 'Random 0'), sheet(301, 'Random 1')]
    const ev = await service.evaluate({ description: VALID.description, locale: 'fr', target: TARGET, candidates })
    assert.equal(ev.chosenGameId, 300)
    assert.equal(ev.accepted, false)
  })

  it('sends opaque labels, never game ids, to the judge', async () => {
    let seen: DescribeJudgeInput | null = null
    const { service } = makeService(
      judgeReturning(async (input) => {
        seen = input
        return { probabilities: { c01: 1 } }
      })
    )
    const candidates = [TARGET, sheet(300, 'Random 0')]
    await service.evaluate({ description: VALID.description, locale: 'fr', target: TARGET, candidates })
    assert.deepEqual(seen!.candidates.map((c) => c.label), [candidateLabel(0), candidateLabel(1)])
  })

  it('returns no verdict and error "timeout" when the judge hangs, and aborts it', async () => {
    let aborted = false
    const { service } = makeService(
      judgeReturning(
        (_input, signal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => {
              aborted = true
              reject(new Error('aborted'))
            })
          })
      ),
      { timeoutMs: 30 }
    )
    const ev = await service.evaluate({
      description: VALID.description,
      locale: 'fr',
      target: TARGET,
      candidates: [TARGET, sheet(300, 'Random 0')],
    })
    assert.equal(ev.error, 'timeout')
    assert.equal(ev.accepted, null)
    assert.equal(ev.chosenGameId, null)
    assert.equal(ev.probability, null)
    assert.equal(aborted, true)
  })

  it('keeps the judge error code and never throws', async () => {
    const { service } = makeService(
      judgeReturning(async () => {
        throw new DescribeJudgeError('rate_limited')
      })
    )
    const ev = await service.evaluate({
      description: VALID.description,
      locale: 'fr',
      target: TARGET,
      candidates: [TARGET, sheet(300, 'Random 0')],
    })
    assert.equal(ev.error, 'rate_limited')
    assert.equal(ev.accepted, null)
  })

  it('maps an unexpected exception to "unknown"', async () => {
    const { service } = makeService(
      judgeReturning(async () => {
        throw new TypeError('boom')
      })
    )
    const ev = await service.evaluate({
      description: VALID.description,
      locale: 'fr',
      target: TARGET,
      candidates: [TARGET, sheet(300, 'Random 0')],
    })
    assert.equal(ev.error, 'unknown')
  })

  it('maps malformed output to "invalid_output"', async () => {
    const { service } = makeService(judgeReturning(async () => ({ nope: true })))
    const ev = await service.evaluate({
      description: VALID.description,
      locale: 'fr',
      target: TARGET,
      candidates: [TARGET, sheet(300, 'Random 0')],
    })
    assert.equal(ev.error, 'invalid_output')
    assert.equal(ev.inputTokens, 1200, 'usage is kept even when the output is unusable')
  })

  it('records the title pre-filter hit alongside the verdict', async () => {
    const { service } = makeService(judgeChoosing(TARGET.id, 0.99))
    const ev = await service.evaluate({
      description: 'facile c est super mario galaxy sur wii',
      locale: 'fr',
      target: TARGET,
      candidates: [TARGET, sheet(300, 'Random 0')],
    })
    assert.equal(ev.titlePrefilterHit, true)
    assert.equal(ev.accepted, true, 'the model verdict is stored as-is; the pre-filter is a separate column')
  })
})

describe('describe-guess submit', () => {
  it('claims, judges, stores the verdict and shifts the round clock', async () => {
    const { service, h } = makeService(judgeChoosing(TARGET.id, 0.9))
    const ev = await service.submit({ ...VALID, description: `  ${VALID.description}  ` })
    assert.equal(h.claims.length, 1)
    assert.equal(h.claims[0]!.description, VALID.description, 'trimmed')
    assert.equal(h.claims[0]!.targetGameId, TARGET.id)
    assert.equal(h.claims[0]!.gameSessionId, 'gs1')
    assert.equal(h.completed.length, 1)
    assert.equal(h.completed[0]!.id, 42)
    assert.equal(h.completed[0]!.evaluation, ev)
    assert.equal(ev.candidateGameIds.length, DESCRIBE_DISTRACTOR_COUNT + 1)
    assert.equal(h.shifts.length, 1)
    assert.ok(h.shifts[0]!.ms > 0)
  })

  it('still stores the row when the judge fails', async () => {
    const { service, h } = makeService(
      judgeReturning(async () => {
        throw new DescribeJudgeError('connection')
      })
    )
    const ev = await service.submit(VALID)
    assert.equal(ev.error, 'connection')
    assert.equal(h.completed.length, 1)
  })

  const rejects: Array<[string, Parameters<typeof makeService>[1], Partial<typeof VALID>, string, number]> = [
    ['too short', {}, { description: 'trop court' }, 'INVALID_DESCRIPTION', 400],
    ['too long', {}, { description: 'x'.repeat(201) }, 'INVALID_DESCRIPTION', 400],
    ['unknown session', { session: null }, {}, 'SESSION_NOT_FOUND', 404],
    ["another player's session", { session: { user_id: 'someone-else' } }, {}, 'SESSION_NOT_FOUND', 404],
    ['finished session', { session: { game_is_completed: true } }, {}, 'SESSION_ALREADY_COMPLETED', 409],
    ['screenshot not at that position', {}, { position: 4 }, 'SCREENSHOT_POSITION_MISMATCH', 400],
    ['already solved', { solved: true }, {}, 'POSITION_ALREADY_SOLVED', 409],
    ['no wrong title attempt yet', { wrong: false }, {}, 'DESCRIBE_NOT_ALLOWED_YET', 409],
    ['second description for the screenshot', { claimResult: null }, {}, 'ALREADY_DESCRIBED', 409],
  ]
  for (const [name, setup, input, code, status] of rejects) {
    it(`rejects: ${name}`, async () => {
      const { service, h } = makeService(judgeChoosing(TARGET.id, 0.9), setup)
      await assert.rejects(
        () => service.submit({ ...VALID, ...input }),
        (e: unknown) => e instanceof DescribeGuessError && e.code === code && e.statusCode === status
      )
      assert.equal(h.judgeCalls, 0, 'no model call on a rejected request')
      assert.equal(h.completed.length, 0)
    })
  }
})
