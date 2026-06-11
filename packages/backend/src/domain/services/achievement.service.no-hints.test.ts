import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createAchievementService,
  type GameCompletionData,
} from './achievement.service.js'
import type { AchievementRepository, UserRepository } from '../ports/index.js'
import type { DomainLogger } from '../ports/logger.js'
import type { AchievementRow } from '../types/achievement.types.js'

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
}

const NO_HINTS_ACHIEVEMENT: AchievementRow = {
  id: 1,
  key: 'no_hints_1',
  name: 'Sans filet',
  description: 'Terminez une partie sans aucun indice',
  category: 'skill',
  icon_url: null,
  points: 10,
  criteria: { type: 'no_hints', count: 1 },
  tier: 1,
  is_hidden: false,
  created_at: new Date('2026-01-01T00:00:00Z'),
}

/**
 * Post-retirement integrity check (D9 of the 2026-06-11 meeting record):
 * `guesses.power_up_used` is always null on new guesses, so the
 * "hint-free game" achievement must ALSO require zero letter reveals for
 * the session — otherwise retirement makes it trivially earnable.
 */
function buildHarness(opts: {
  sessionLetterReveals: number
  hintFreeCompletedGames?: number
}) {
  const awarded: string[] = []
  const letterRevealCalls: string[] = []

  const achievementRepository = {
    findAll: async () => [NO_HINTS_ACHIEVEMENT],
    getUserProgress: async () => ({}),
    awardAchievement: async (_userId: string, key: string) => {
      awarded.push(key)
      return {} as never
    },
    countSessionLetterReveals: async (gameSessionId: string) => {
      letterRevealCalls.push(gameSessionId)
      return opts.sessionLetterReveals
    },
    countHintFreeCompletedGames: async () => opts.hintFreeCompletedGames ?? 1,
  } as unknown as AchievementRepository

  const userRepository = {} as unknown as UserRepository

  const service = createAchievementService({
    logger: silentLogger,
    achievementRepository,
    userRepository,
  })

  return { service, awarded, letterRevealCalls }
}

function completionData(
  guesses: GameCompletionData['guesses']
): GameCompletionData {
  return {
    userId: 'user-1',
    sessionId: 'session-1',
    challengeId: 42,
    totalScore: 1000,
    guesses,
    gameGenres: [],
    currentStreak: 1,
    longestStreak: 1,
  }
}

const plainCorrectGuess = {
  position: 1,
  isCorrect: true,
  roundTimeTakenMs: 5000,
  powerUpUsed: null,
  screenshotId: 1,
}

describe('achievement.service — no_hints requires zero letter reveals', () => {
  it('awards when no power-up was used AND no letters were revealed', async () => {
    const h = buildHarness({ sessionLetterReveals: 0 })
    const earned = await h.service.checkAchievementsAfterGame(
      completionData([plainCorrectGuess])
    )
    assert.deepEqual(h.awarded, ['no_hints_1'])
    assert.equal(earned.length, 1)
    assert.deepEqual(
      h.letterRevealCalls,
      ['session-1'],
      'the letter-reveal count must be checked for the completed session'
    )
  })

  it('does NOT award when the session has letter reveals, even with power_up_used null everywhere', async () => {
    const h = buildHarness({ sessionLetterReveals: 1 })
    const earned = await h.service.checkAchievementsAfterGame(
      completionData([plainCorrectGuess])
    )
    assert.deepEqual(h.awarded, [], 'a revealed letter is a hint — no award')
    assert.equal(earned.length, 0)
  })

  it('still rejects historical sessions with a non-null power_up_used', async () => {
    const h = buildHarness({ sessionLetterReveals: 0 })
    const earned = await h.service.checkAchievementsAfterGame(
      completionData([{ ...plainCorrectGuess, powerUpUsed: 'hint_year' }])
    )
    assert.deepEqual(h.awarded, [])
    assert.equal(earned.length, 0)
  })
})
