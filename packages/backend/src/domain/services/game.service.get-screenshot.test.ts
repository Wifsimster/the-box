import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createGameService, type GameServiceDeps } from './game.service.js'
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

// Minimal harness exercising getScreenshot's projection of the tier's
// countdown limit into the ScreenshotResponse the client uses to run its timer.
function buildService(timeLimitSeconds: number | null) {
  const deps = {
    logger: silentLogger,
    fuzzyMatchService: {
      // Fragments never match in this harness — letter caps stay at the
      // static formula, which is all the masked-title assertions need.
      isMatch: () => false,
    },
    sessionRepository: {
      findGameSessionById: async () => ({ id: 'game-1', daily_challenge_id: 1 }),
      findLatestTierSession: async () => ({ id: 'tier-session-1' }),
      markRoundStarted: async () => {},
    },
    challengeRepository: {
      findTiersByChallenge: async () => [{ id: 7, time_limit_seconds: timeLimitSeconds }],
      findScreenshotAtPosition: async () => ({
        screenshot_id: 42,
        position: 3,
        bonus_multiplier: '1.0',
      }),
    },
    screenshotRepository: {
      findWithGame: async () => ({
        screenshot: { gameId: 99 },
        gameName: 'Elden Ring',
        coverImageUrl: null,
        aliases: [],
        releaseYear: 2022,
        metacritic: null,
      }),
    },
    positionLetterRevealRepository: {
      find: async () => null,
    },
  } as unknown as GameServiceDeps
  return createGameService(deps)
}

describe('game.service getScreenshot — countdown limit', () => {
  it('exposes the tier time_limit_seconds to the client', async () => {
    const service = buildService(45)
    const res = await service.getScreenshot('game-1', 3, 'user-1')
    assert.equal(res.timeLimitSeconds, 45)
    assert.equal(res.screenshotId, 42)
    assert.equal(res.position, 3)
  })

  it('passes a custom (non-default) limit straight through', async () => {
    const service = buildService(60)
    const res = await service.getScreenshot('game-1', 3, 'user-1')
    assert.equal(res.timeLimitSeconds, 60)
  })

  it('falls back to 45 when a legacy tier has no limit', async () => {
    const service = buildService(null)
    const res = await service.getScreenshot('game-1', 3, 'user-1')
    assert.equal(res.timeLimitSeconds, 45)
  })

  it('keeps the mask empty before the first paid reveal — no skeleton, no title', async () => {
    const service = buildService(45)
    const res = await service.getScreenshot('game-1', 3, 'user-1')
    assert.equal(res.letterReveal?.maskedTitle, '')
    assert.equal(res.letterReveal?.lettersRevealed, 0)
    assert.equal(res.letterReveal?.penaltyPct, 0)
    assert.ok(!JSON.stringify(res).includes('Elden'), 'response must not leak the title')
    assert.ok(!JSON.stringify(res).includes('_'), 'response must not leak the word shape')
  })
})
