import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACHIEVEMENT_CRITERIA_TYPES,
  createAchievementService,
} from './achievement.service.js'
import type { AchievementRow } from '../types/achievement.types.js'
import { createRecordingLogger } from '../ports/logger.test-double.js'
import type { AchievementRepository, AchievementUserContext } from '../ports/index.js'

/**
 * Guards the criteria registry against the two ways it used to rot:
 *  1. a criteria type seeded into the database that nothing implements
 *     (it used to fall through to a `default:` and warn forever), and
 *  2. the post-game evaluator and the progress calculator disagreeing,
 *     because they were two separate `switch` statements.
 */

/** Every `criteria.type` any migration actually seeds into `achievements`. */
function seededCriteriaTypes(): Set<string> {
  const migrationsDir = join(import.meta.dirname, '../../../migrations')
  const types = new Set<string>()

  for (const file of readdirSync(migrationsDir)) {
    if (!file.endsWith('.ts')) continue
    const source = readFileSync(join(migrationsDir, file), 'utf8')
    // Only look inside JSON.stringify({ type: '...' }) calls, which is how
    // every achievement migration writes its criteria column. This avoids
    // picking up unrelated `type:` keys (e.g. daily-login reward_type).
    for (const match of source.matchAll(/JSON\.stringify\(\{\s*type:\s*'([a-z_]+)'/g)) {
      if (match[1]) types.add(match[1])
    }
  }
  return types
}

describe('achievement criteria registry', () => {
  it('declares a handler for every criteria type seeded by a migration', () => {
    const seeded = seededCriteriaTypes()
    assert.ok(seeded.size > 0, 'sanity: migrations should seed some criteria')

    const known = new Set<string>(ACHIEVEMENT_CRITERIA_TYPES)
    const unhandled = [...seeded].filter((type) => !known.has(type)).sort()

    assert.deepEqual(
      unhandled,
      [],
      `these criteria types are seeded into the database but absent from ` +
        `ACHIEVEMENT_CRITERIA_TYPES, so the evaluator cannot recognize them`
    )
  })

  it('lists no duplicate criteria types', () => {
    assert.equal(
      new Set(ACHIEVEMENT_CRITERIA_TYPES).size,
      ACHIEVEMENT_CRITERIA_TYPES.length
    )
  })

  it('does not warn about a registered criteria type after a game', async () => {
    // Before the registry, the GeoGamers achievements (awarded by key from
    // their own route) hit the evaluator's `default:` branch and logged
    // "Unknown achievement criteria type" after EVERY classic game.
    const logger = createRecordingLogger()

    const achievements: AchievementRow[] = ACHIEVEMENT_CRITERIA_TYPES.map((type, i) => ({
      id: i + 1,
      key: `test_${type}`,
      name: type,
      description: null,
      category: 'test',
      icon_url: null,
      points: 1,
      criteria: { type, count: 999_999, score: 999_999, days: 999_999, max_rank: 0, max_time_ms: 1 },
      tier: 1,
      is_hidden: false,
      created_at: new Date(),
    }))

    const achievementRepository = {
      findAll: async () => achievements,
      getUserProgress: async () => ({}),
      awardAchievement: async () => {},
      findByKey: async () => null,
      countGenreCorrectGuesses: async () => 0,
      getUserBestChallengeRank: async () => null,
    } as unknown as AchievementRepository

    const userRepository: AchievementUserContext = {
      findById: async () => null,
      getCurrentStreak: async () => 0,
    }

    const service = createAchievementService({
      logger,
      achievementRepository,
      userRepository,
    })

    await service.checkAchievementsAfterGame({
      userId: 'u1',
      sessionId: 's1',
      challengeId: 1,
      totalScore: 0,
      guesses: [],
      gameGenres: [],
      currentStreak: 0,
      longestStreak: 0,
    })

    const unknownWarnings = logger.records.filter(
      (r) =>
        r.level === 'warn' &&
        r.args.some((a) => typeof a === 'string' && a.includes('Unknown achievement criteria'))
    )

    assert.deepEqual(
      unknownWarnings,
      [],
      'every declared criteria type must be recognized by the dispatcher'
    )
  })
})
