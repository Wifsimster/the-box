import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createAchievementService,
  type GameCompletionData,
} from './achievement.service.js'
import type { AchievementRepository, AchievementUserContext } from '../ports/index.js'
import type { DomainLogger } from '../ports/logger.js'
import type { AchievementRow } from '../types/achievement.types.js'

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const PERFECT_ACHIEVEMENT: AchievementRow = {
  id: 1,
  key: 'perfect_score',
  name: 'Perfection',
  description: 'Score parfait',
  category: 'skill',
  icon_url: null,
  points: 50,
  criteria: { type: 'perfect_score' },
  tier: 1,
  is_hidden: false,
  created_at: new Date('2026-01-01T00:00:00Z'),
}

/**
 * The in-game streak bonus lifts a perfect run above 2000 (up to 2175), so
 * "perfect" is judged on the speed score: totalScore minus the streak bonus.
 */
async function awardedFor(totalScore: number, streakBonusTotal?: number): Promise<string[]> {
  const awarded: string[] = []
  const achievementRepository = {
    findAll: async () => [PERFECT_ACHIEVEMENT],
    getUserProgress: async () => ({}),
    awardAchievement: async (_userId: string, key: string) => {
      awarded.push(key)
      return {} as never
    },
  } as unknown as AchievementRepository
  const userRepository: AchievementUserContext = {
    findById: async () => null,
    getCurrentStreak: async () => 0,
  }
  const service = createAchievementService({
    logger: silentLogger,
    achievementRepository,
    userRepository,
  })
  const data: GameCompletionData = {
    userId: 'user-1',
    sessionId: 'session-1',
    challengeId: 42,
    totalScore,
    streakBonusTotal,
    guesses: [],
    gameGenres: [],
    currentStreak: 1,
    longestStreak: 1,
  }
  await service.checkAchievementsAfterGame(data)
  return awarded
}

describe('achievement.service — perfect_score with the streak bonus', () => {
  it('awards a pre-bonus perfect game (2000, no bonus)', async () => {
    assert.deepEqual(await awardedFor(2000), ['perfect_score'])
  })

  it('awards a perfect run that also earned the full streak bonus (2175)', async () => {
    assert.deepEqual(await awardedFor(2175, 175), ['perfect_score'])
  })

  it('does not award a non-perfect run lifted to 2000+ by the bonus', async () => {
    assert.deepEqual(await awardedFor(2100, 175), [])
    assert.deepEqual(await awardedFor(2000, 175), [])
  })
})
