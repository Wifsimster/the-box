import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { DomainLogger } from '../ports/logger.js'
import { createGeoGamersScoringService } from './geogamers-scoring.service.js'
import {
  createGeoGamersService,
  GeoGamersError,
  type GeoGamersChallengeRecord,
  type GeoGamersChallengeRepository,
  type GeoGamersRunRecord,
  type GeoGamersRunRepository,
  type GeoGamersJokerRepository,
  type GeoGamersAlternatePicker,
  type CreateRunInput,
  type UpdateRunInput,
} from './geogamers.service.js'

const noopLogger: DomainLogger = {
  info() {}, warn() {}, error() {}, debug() {}, fatal() {}, trace() {},
  child() { return noopLogger },
}

// ---- in-memory fakes ----
const CHALLENGE: GeoGamersChallengeRecord = {
  id: 1,
  challengeDate: '2026-07-10',
  geoScreenshotMetaId: 100,
}

const META = {
  id: 100,
  geoScreenshotCandidateId: 500,
  geoMapId: 900,
  canonical: { x: 0.5, y: 0.5 },
  confidence: 1,
  consensusVersion: 1,
  promotedVia: 'admin' as const,
}
const ALT_META = { ...META, id: 101, geoScreenshotCandidateId: 501, geoMapId: 900 }
const CANDIDATE = { id: 500, gameId: 42, geoMapId: 900, imageUrl: 'file:///uploads/eldenring-xyz.jpg', source: 'manual' as const, status: 'promoted' as const, pinCount: 3 }
const ALT_CANDIDATE = { ...CANDIDATE, id: 501, imageUrl: 'file:///uploads/witcher-abc.jpg' }
const GAME = { id: 42, name: 'Elden Ring', aliases: [] as string[] }
const MAP = { id: 900, gameId: 42, source: 'manual', imageUrl: 'm.png', widthPx: 1000, heightPx: 1000, kind: 'image', consensusRadius: 0.03, license: 'CC' }
const OTHER_MAP = { ...MAP, id: 901 }

function makeDeps(overrides: { jokerUsed?: boolean } = {}) {
  const runs = new Map<string, GeoGamersRunRecord>()
  let seq = 1
  const completedScores: number[] = []

  const challengeRepo: GeoGamersChallengeRepository = {
    async findCurrent() { return CHALLENGE },
    async findByDate(d) { return d === CHALLENGE.challengeDate ? CHALLENGE : null },
  }

  const runRepo: GeoGamersRunRepository = {
    async findByToken(t) { return runs.get(t) ?? null },
    async findRankedForUser(cid, uid) {
      for (const r of runs.values()) if (r.challengeId === cid && r.userId === uid) return r
      return null
    },
    async create(input: CreateRunInput) {
      const r: GeoGamersRunRecord = {
        id: seq++, challengeId: input.challengeId, userId: input.userId,
        anonymousSessionId: input.anonymousSessionId, runToken: input.runToken,
        geoScreenshotMetaId: null, gameAttempts: [], gamePoints: null, guess: null,
        distance: null, locationPoints: null, totalPoints: null, scoreVersion: null,
        timeSpentMs: 0, startedAt: new Date(0).toISOString(), completedAt: null,
        jokerUsed: false, claimedAt: null, claimedByUserId: null,
      }
      runs.set(r.runToken, r)
      return r
    },
    async update(runId: number, patch: UpdateRunInput) {
      const r = [...runs.values()].find((x) => x.id === runId)!
      Object.assign(r, patch)
      if (patch.completedAt && r.totalPoints != null) completedScores.push(r.totalPoints)
      return r
    },
    async countCompletedBetter(_cid, points) {
      return completedScores.filter((s) => s > points).length
    },
    async claimGuestRun({ guestRunId, userId }) {
      const guest = [...runs.values()].find((x) => x.id === guestRunId)!
      guest.claimedAt = new Date(1).toISOString()
      guest.claimedByUserId = userId
      const copy: GeoGamersRunRecord = { ...guest, id: seq++, userId, anonymousSessionId: null, runToken: 'claimed-token' }
      runs.set(copy.runToken, copy)
      return copy
    },
  }

  const jokerRepo: GeoGamersJokerRepository = {
    async hasUsed() { return !!overrides.jokerUsed },
    async record() {},
  }
  const alternatePicker: GeoGamersAlternatePicker = {
    async pickAlternate() { return ALT_META.id },
  }

  const screenshotRepo = {
    async findMetaById(id: number) { return id === META.id ? META : id === ALT_META.id ? ALT_META : null },
    async findCandidateById(id: number) { return id === CANDIDATE.id ? CANDIDATE : id === ALT_CANDIDATE.id ? ALT_CANDIDATE : null },
  } as never

  const mapRepo = {
    async listEnabledByGameId() { return [MAP, OTHER_MAP] },
    async findEnabledById(_g: number, mapId: number) { return mapId === MAP.id ? MAP : mapId === OTHER_MAP.id ? OTHER_MAP : null },
  } as never

  const gameRepo = { async findById(id: number) { return id === GAME.id ? GAME : null } } as never
  const fuzzyMatch = {
    evaluateMatch(input: string) {
      return { matched: input.trim().toLowerCase() === 'elden ring', precision: 'exact' as const }
    },
  } as never

  const scoring = createGeoGamersScoringService({ logger: noopLogger })

  const svc = createGeoGamersService({
    logger: noopLogger, challengeRepo, runRepo, jokerRepo, alternatePicker,
    screenshotRepo, mapRepo, gameRepo, fuzzyMatch, scoring,
    screenshotUrlFor: (t) => `/api/geogamers/image/${t}`,
    now: () => 60_000, // 60s after epoch — well past the min-run floor
  })
  return { svc, runs }
}

describe('geogamers.service anti-leak', () => {
  it('identify-phase view exposes NO game or map identity', async () => {
    const { svc } = makeDeps()
    const view = await svc.startOrResumeRun({ userId: 'u1', anonymousSessionId: null })
    assert.equal(view.phase, 'identify')
    assert.equal(view.game, undefined)
    assert.equal(view.maps, undefined)
    assert.equal(view.gamePoints, undefined)
    // screenshot url is opaque (no game slug)
    assert.match(view.screenshotUrl, /^\/api\/geogamers\/image\//)
    assert.doesNotMatch(view.screenshotUrl, /elden|uploads/i)
  })
})

describe('geogamers.service phase 1', () => {
  it('correct guess reveals game + maps and locks 100 points on attempt 1', async () => {
    const { svc } = makeDeps()
    const start = await svc.startOrResumeRun({ userId: 'u1', anonymousSessionId: null })
    const res = await svc.guessGame({ runToken: start.runToken, guess: 'Elden Ring' })
    assert.equal(res.correct, true)
    assert.equal(res.gamePoints, 100)
    assert.equal(res.run.phase, 'locate')
    assert.equal(res.run.game?.name, 'Elden Ring')
    assert.ok((res.run.maps?.length ?? 0) >= 1)
  })

  it('three wrong guesses exhaust to locate with 0 game points', async () => {
    const { svc } = makeDeps()
    const start = await svc.startOrResumeRun({ userId: 'u1', anonymousSessionId: null })
    await svc.guessGame({ runToken: start.runToken, guess: 'Dark Souls' })
    await svc.guessGame({ runToken: start.runToken, guess: 'Sekiro' })
    const third = await svc.guessGame({ runToken: start.runToken, guess: 'Bloodborne' })
    assert.equal(third.correct, false)
    assert.equal(third.attemptsRemaining, 0)
    assert.equal(third.gamePoints, 0)
    assert.equal(third.run.phase, 'locate')
    assert.equal(third.run.gamePoints, 0)
  })

  it('rejects a game guess once past the identify phase', async () => {
    const { svc } = makeDeps()
    const start = await svc.startOrResumeRun({ userId: 'u1', anonymousSessionId: null })
    await svc.guessGame({ runToken: start.runToken, guess: 'Elden Ring' })
    await assert.rejects(
      svc.guessGame({ runToken: start.runToken, guess: 'again' }),
      (e) => e instanceof GeoGamersError && e.code === 'WRONG_PHASE',
    )
  })
})

describe('geogamers.service phase 2', () => {
  it('exact pin completes the run at 200 and returns a live rank', async () => {
    const { svc } = makeDeps()
    const start = await svc.startOrResumeRun({ userId: 'u1', anonymousSessionId: null })
    await svc.guessGame({ runToken: start.runToken, guess: 'Elden Ring' })
    const loc = await svc.guessLocation({ runToken: start.runToken, geoMapId: MAP.id, guess: { x: 0.5, y: 0.5 } })
    assert.equal(loc.gamePoints, 100)
    assert.equal(loc.locationPoints, 100)
    assert.equal(loc.totalPoints, 200)
    assert.equal(loc.rank, 1)
    assert.equal(loc.ghostRank, undefined)
  })

  it('wrong map floors location points to ~0', async () => {
    const { svc } = makeDeps()
    const start = await svc.startOrResumeRun({ userId: 'u1', anonymousSessionId: null })
    await svc.guessGame({ runToken: start.runToken, guess: 'Elden Ring' })
    const loc = await svc.guessLocation({ runToken: start.runToken, geoMapId: OTHER_MAP.id, guess: { x: 0.5, y: 0.5 } })
    assert.ok(loc.locationPoints <= 1)
    assert.equal(loc.distance, 1)
  })

  it('guest gets a ghostRank, not a rank', async () => {
    const { svc } = makeDeps()
    const start = await svc.startOrResumeRun({ userId: null, anonymousSessionId: 'guest-1' })
    await svc.guessGame({ runToken: start.runToken, guess: 'Elden Ring' })
    const loc = await svc.guessLocation({ runToken: start.runToken, geoMapId: MAP.id, guess: { x: 0.51, y: 0.5 } })
    assert.equal(typeof loc.ghostRank, 'number')
    assert.equal(loc.rank, undefined)
  })
})

describe('geogamers.service joker', () => {
  it('re-rolls when in identify with no attempts', async () => {
    const { svc } = makeDeps()
    const start = await svc.startOrResumeRun({ userId: 'u1', anonymousSessionId: null })
    const view = await svc.useJoker({ userId: 'u1', runToken: start.runToken })
    assert.equal(view.phase, 'identify')
    assert.equal(view.attemptsUsed, 0)
  })

  it('is refused after an attempt has been spent', async () => {
    const { svc } = makeDeps()
    const start = await svc.startOrResumeRun({ userId: 'u1', anonymousSessionId: null })
    await svc.guessGame({ runToken: start.runToken, guess: 'Dark Souls' })
    await assert.rejects(
      svc.useJoker({ userId: 'u1', runToken: start.runToken }),
      (e) => e instanceof GeoGamersError && e.code === 'JOKER_NOT_ALLOWED',
    )
  })

  it('is refused when already used this season', async () => {
    const { svc } = makeDeps({ jokerUsed: true })
    const start = await svc.startOrResumeRun({ userId: 'u1', anonymousSessionId: null })
    await assert.rejects(
      svc.useJoker({ userId: 'u1', runToken: start.runToken }),
      (e) => e instanceof GeoGamersError && e.code === 'JOKER_ALREADY_USED',
    )
  })
})

describe('geogamers.service claim', () => {
  it('rejects claiming a run that is not completed', async () => {
    const { svc } = makeDeps()
    const start = await svc.startOrResumeRun({ userId: null, anonymousSessionId: 'guest-1' })
    await assert.rejects(
      svc.claimRun({ userId: 'u9', runToken: start.runToken }),
      (e) => e instanceof GeoGamersError && e.code === 'CLAIM_INVALID',
    )
  })

  it('claims a completed guest run into an account', async () => {
    const { svc } = makeDeps()
    const start = await svc.startOrResumeRun({ userId: null, anonymousSessionId: 'guest-1' })
    await svc.guessGame({ runToken: start.runToken, guess: 'Elden Ring' })
    await svc.guessLocation({ runToken: start.runToken, geoMapId: MAP.id, guess: { x: 0.5, y: 0.5 } })
    const claimed = await svc.claimRun({ userId: 'u9', runToken: start.runToken })
    assert.equal(claimed.phase, 'done')
  })
})
