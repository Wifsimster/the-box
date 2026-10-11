import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DESCRIBE_DISTRACTOR_COUNT,
  DESCRIBE_RELATED_MAX,
  DESCRIBE_SAME_SERIES_MAX,
  candidateLabel,
  createCaptureGate,
  createDescribeGuessService,
  createWindowLimiter,
  hasDescriptionShape,
  matchesCatalogueTitle,
  isAccepted,
  parseVerdict,
  selectCandidates,
  titlePrefilterHit,
  type CandidatePools,
  type DescribeAttemptPort,
  type DescribeClaim,
  type CatalogueTitle,
  type DescribeEvaluation,
  type DescriptionCaptureJob,
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
  judgeCalls: number
}

const CATALOGUE: CatalogueTitle[] = [
  { id: 1, name: 'Super Mario Galaxy', aliases: [] },
  { id: 2, name: 'Call of Duty: Black Ops', aliases: ['COD Black Ops'] },
  { id: 3, name: 'The Legend of Zelda: Breath of the Wild', aliases: ['Zelda BOTW'] },
  { id: 4, name: 'Grand Theft Auto V', aliases: ['GTA 5'] },
  { id: 5, name: 'Hollow Knight', aliases: [] },
]

function makeService(
  judge: DescribeJudge,
  overrides: { claimResult?: number | null; timeoutMs?: number; target?: DescribeGameSheet | null } = {}
) {
  const h: Harness = { claims: [], completed: [], judgeCalls: 0 }
  const attempts: DescribeAttemptPort = {
    findTargetSheet: async () => (overrides.target === undefined ? TARGET : overrides.target),
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
    attempts,
    catalogue: { listTitles: async () => CATALOGUE },
    logger: silentLogger,
    rng: seeded(11),
    now: () => (clock += 250),
    timeoutMs: overrides.timeoutMs ?? 5000,
  })
  return { service, h }
}

const JOB: DescriptionCaptureJob = {
  userId: 'u1',
  isGuest: false,
  tierSessionId: 'ts1',
  screenshotId: 77,
  position: 3,
  guessText: 'un plombier qui saute de planete en planete pour sauver la princesse',
  locale: 'fr',
}

describe('describe-guess evaluate', () => {
  it('records an accepted verdict when the judge picks the target at >= 0.8', async () => {
    const { service } = makeService(judgeChoosing(TARGET.id, 0.92))
    const candidates = selectCandidates(TARGET, bigPools(), seeded(2))
    const ev = await service.evaluate({ description: JOB.guessText, locale: 'fr', target: TARGET, candidates })
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
    const ev = await service.evaluate({ description: JOB.guessText, locale: 'fr', target: TARGET, candidates })
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
    await service.evaluate({ description: JOB.guessText, locale: 'fr', target: TARGET, candidates })
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
      description: JOB.guessText,
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
      description: JOB.guessText,
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
      description: JOB.guessText,
      locale: 'fr',
      target: TARGET,
      candidates: [TARGET, sheet(300, 'Random 0')],
    })
    assert.equal(ev.error, 'unknown')
  })

  it('maps malformed output to "invalid_output"', async () => {
    const { service } = makeService(judgeReturning(async () => ({ nope: true })))
    const ev = await service.evaluate({
      description: JOB.guessText,
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

describe('trigger: hasDescriptionShape', () => {
  for (const text of [
    'un plombier qui saute de planete en planete',
    'plombier moustachu',
    'jeu de ferme en pixel',
    '  souls   avec un cheval  ',
    "c'est le jeu avec le chevalier insecte",
  ]) {
    it(`description-like: ${JSON.stringify(text)}`, () => assert.equal(hasDescriptionShape(text), true))
  }
  for (const text of [
    'zelda',
    'mario kart',
    'dark souls',
    'half life 2',
    'gta 5 pc',
    'god of war',
    'supercalifragilisticexpialidocious',
    '- - - - - - - - - -',
    '   ',
    'x'.repeat(250) + ' y',
  ]) {
    it(`not description-like: ${JSON.stringify(text.slice(0, 30))}`, () => assert.equal(hasDescriptionShape(text), false))
  }
})

describe('trigger: matchesCatalogueTitle', () => {
  it('flags long wrong titles that name a catalogue game', () => {
    assert.equal(matchesCatalogueTitle('call of duty black ops', CATALOGUE, fuzzy), true)
    assert.equal(matchesCatalogueTitle('zelda breath of the wild', CATALOGUE, fuzzy), true)
    assert.equal(matchesCatalogueTitle('grand theft auto five', CATALOGUE, fuzzy), true)
    assert.equal(matchesCatalogueTitle('super mario galaxy', CATALOGUE, fuzzy), true)
  })
  it('does not flag descriptions', () => {
    assert.equal(matchesCatalogueTitle('un plombier qui saute de planete en planete', CATALOGUE, fuzzy), false)
    assert.equal(matchesCatalogueTitle('mario mais dans l espace avec des etoiles', CATALOGUE, fuzzy), false)
    assert.equal(matchesCatalogueTitle('petit chevalier insecte dans un royaume souterrain', CATALOGUE, fuzzy), false)
  })
  it('stays fast on a large catalogue', () => {
    const big: CatalogueTitle[] = Array.from({ length: 5000 }, (_, i) => ({ id: i, name: `Some Game Title ${i}`, aliases: [] }))
    const t0 = performance.now()
    matchesCatalogueTitle('un plombier qui saute de planete en planete pour sauver', big, fuzzy)
    assert.ok(performance.now() - t0 < 300)
  })
})

describe('capture gate (guess request path)', () => {
  function gate(opts: { active?: boolean; max?: number } = {}) {
    const enqueued: DescriptionCaptureJob[] = []
    const maybe = createCaptureGate({
      isActive: async () => opts.active ?? true,
      limiter: createWindowLimiter({ max: opts.max ?? 20, windowMs: 3_600_000, now: () => 0 }),
      enqueue: async (job) => void enqueued.push(job),
    })
    return { maybe, enqueued }
  }

  it('enqueues a description-like wrong guess when the feature is on', async () => {
    const { maybe, enqueued } = gate()
    assert.equal(await maybe(JOB), 'enqueued')
    assert.equal(enqueued.length, 1)
  })
  it('never enqueues a short wrong title', async () => {
    const { maybe, enqueued } = gate()
    assert.equal(await maybe({ ...JOB, guessText: 'mario kart' }), 'skipped:shape')
    assert.equal(enqueued.length, 0)
  })
  it('never enqueues when the feature is off (disabled or no key)', async () => {
    const { maybe, enqueued } = gate({ active: false })
    assert.equal(await maybe(JOB), 'skipped:off')
    assert.equal(enqueued.length, 0)
  })
  it('checks the shape before reading settings', async () => {
    let reads = 0
    const maybe = createCaptureGate({
      isActive: async () => (reads++, true),
      limiter: createWindowLimiter({ max: 5, windowMs: 1000 }),
      enqueue: async () => {},
    })
    await maybe({ ...JOB, guessText: 'zelda' })
    assert.equal(reads, 0)
  })
  it('caps captures per account', async () => {
    const { maybe, enqueued } = gate({ max: 2 })
    assert.equal(await maybe(JOB), 'enqueued')
    assert.equal(await maybe({ ...JOB, position: 4 }), 'enqueued')
    assert.equal(await maybe({ ...JOB, position: 5 }), 'skipped:rate')
    assert.equal(await maybe({ ...JOB, userId: 'u2' }), 'enqueued', 'per account')
    assert.equal(enqueued.length, 3)
  })
  it('the limiter window resets', () => {
    let t = 0
    const limiter = createWindowLimiter({ max: 1, windowMs: 1000, now: () => t })
    assert.equal(limiter.tryTake('u'), true)
    assert.equal(limiter.tryTake('u'), false)
    t = 1001
    assert.equal(limiter.tryTake('u'), true)
  })
})

describe('describe-guess capture (worker)', () => {
  it('claims, judges and stores the verdict with the original guess', async () => {
    const { service, h } = makeService(judgeChoosing(TARGET.id, 0.9))
    const raw = '  un plombier   qui saute de planete en planete pour sauver la princesse '
    const out = await service.capture({ ...JOB, guessText: raw })
    assert.equal(out.status, 'recorded')
    assert.equal(h.claims.length, 1)
    assert.equal(h.claims[0]!.guessText, raw, 'original text kept')
    assert.equal(h.claims[0]!.description, JOB.guessText, 'normalised text judged')
    assert.equal(h.claims[0]!.targetGameId, TARGET.id)
    assert.equal(h.judgeCalls, 1)
    assert.equal(h.completed.length, 1)
    assert.equal(h.completed[0]!.evaluation.accepted, true)
    assert.equal(h.completed[0]!.evaluation.candidateGameIds.length, DESCRIBE_DISTRACTOR_COUNT + 1)
  })

  it('one capture per screenshot per session: a second one is skipped without a model call', async () => {
    const { service, h } = makeService(judgeChoosing(TARGET.id, 0.9), { claimResult: null })
    assert.deepEqual(await service.capture(JOB), { status: 'skipped', reason: 'already_captured' })
    assert.equal(h.judgeCalls, 0)
  })

  it('skips a title-like guess without claiming or calling the model', async () => {
    const { service, h } = makeService(judgeChoosing(TARGET.id, 0.9))
    assert.deepEqual(await service.capture({ ...JOB, guessText: 'call of duty black ops' }), { status: 'skipped', reason: 'title_like' })
    assert.equal(h.claims.length, 0)
    assert.equal(h.judgeCalls, 0)
  })

  it('re-checks the shape (a job is never trusted blindly)', async () => {
    const { service, h } = makeService(judgeChoosing(TARGET.id, 0.9))
    assert.deepEqual(await service.capture({ ...JOB, guessText: 'zelda' }), { status: 'skipped', reason: 'shape' })
    assert.equal(h.judgeCalls, 0)
  })

  it('stores the row with no verdict when the judge fails', async () => {
    const { service, h } = makeService(
      judgeReturning(async () => {
        throw new DescribeJudgeError('connection')
      })
    )
    const out = await service.capture(JOB)
    assert.equal(out.status, 'recorded')
    assert.equal(h.completed[0]!.evaluation.error, 'connection')
    assert.equal(h.completed[0]!.evaluation.accepted, null)
  })

  it('skips when the screenshot has no game', async () => {
    const { service, h } = makeService(judgeChoosing(TARGET.id, 0.9), { target: null })
    assert.deepEqual(await service.capture(JOB), { status: 'skipped', reason: 'no_target' })
    assert.equal(h.claims.length, 0)
  })
})
