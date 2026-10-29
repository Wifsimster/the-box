import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createGameService, GameError, type GameServiceDeps } from './game.service.js'
import type { DomainLogger } from '../ports/logger.js'

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const TOTAL_SCREENSHOTS = 10

function buildHarness(opts: { streakBonusEnabled?: boolean } = {}) {
  const guesses: Array<{
    position: number
    isCorrect: boolean
    powerUpUsed: string | null
    hintFromInventory: boolean
    scoreEarned: number
  }> = []
  const useItemsCalls: Array<{ itemType: string; itemKey: string }> = []
  const candidateLookups: string[] = []
  const tierSession = {
    id: 'tier-1',
    user_id: 'user-1',
    game_session_id: 'game-1',
    daily_challenge_id: 1,
    is_catch_up: false,
    round_started_at: new Date(Date.now() - 5000) as Date | null,
    round_position: 1 as number | null,
    score: 0,
    correct_answers: 0,
    wrong_guesses: 0,
    game_total_score: 0,
    game_is_completed: false,
    streak_bonus_enabled: opts.streakBonusEnabled ?? false,
    game_streak_bonus_total: 0,
  }

  const sessionRepository = {
    withTierSessionLock: async <T>(_id: string, fn: () => Promise<T>) => fn(),
    findTierSessionWithContext: async () => ({ ...tierSession }),
    saveGuess: async (data: {
      position: number
      isCorrect: boolean
      powerUpUsed: string | null
      hintFromInventory: boolean
      scoreEarned: number
    }) => {
      guesses.push({
        position: data.position,
        isCorrect: data.isCorrect,
        powerUpUsed: data.powerUpUsed,
        hintFromInventory: data.hintFromInventory,
        scoreEarned: data.scoreEarned,
      })
    },
    getCorrectAnswersCount: async () => {
      const solved = new Set(guesses.filter((g) => g.isCorrect).map((g) => g.position))
      return solved.size
    },
    hasCorrectGuessForPosition: async (_id: string, position: number) =>
      guesses.some((g) => g.isCorrect && g.position === position),
    hasWrongGuessForPosition: async (_id: string, position: number) =>
      guesses.some((g) => !g.isCorrect && g.position === position),
    getFirstTrySolvedPositions: async () =>
      [...new Set(guesses.filter((g) => g.isCorrect).map((g) => g.position))].filter(
        (position) => !guesses.some((g) => !g.isCorrect && g.position === position)
      ),
    updateTierSession: async (
      _id: string,
      data: { score: number; correctAnswers: number; wrongGuesses: number }
    ) => {
      tierSession.score = data.score
      tierSession.correct_answers = data.correctAnswers
      tierSession.wrong_guesses = data.wrongGuesses
    },
    updateGameSession: async (
      _id: string,
      data: { totalScore: number; streakBonusTotal?: number }
    ) => {
      tierSession.game_total_score = data.totalScore
      if (data.streakBonusTotal !== undefined) {
        tierSession.game_streak_bonus_total = data.streakBonusTotal
      }
    },
    findAchievementGuessData: async () => [],
  }

  const deps = {
    logger: silentLogger,
    fuzzyMatchService: {
      isMatch: (guess: string) => guess.trim() === 'right',
      evaluateMatch: (guess: string) => {
        const g = guess.trim()
        if (g === 'right') return { matched: true, precision: 'exact' as const }
        if (g === 'franchise') return { matched: true, precision: 'partial' as const }
        return { matched: false, precision: 'none' as const }
      },
    },
    achievementService: {
      checkAchievementsAfterGame: async () => [],
    },
    challengeRepository: {
      findTiersByChallenge: async () => [{ id: 1 }],
      findScreenshotAtPosition: async (_tierId: number, position: number) => ({
        position,
        bonus_multiplier: '1',
        screenshot_id: position,
        image_url: '',
      }),
    },
    sessionRepository,
    screenshotRepository: {
      findWithGame: async () => ({
        screenshot: { gameId: 99 },
        gameName: 'Halo',
        coverImageUrl: null,
        aliases: [],
        releaseYear: 2001,
        metacritic: null,
      }),
      getGameByScreenshotId: async () => ({ publisher: 'MS', developer: 'Bungie' }),
    },
    userRepository: {
      findById: async () => ({ currentStreak: 0 }),
      updateStreak: async () => {},
      updateScore: async () => {},
    },
    inventoryRepository: {
      useItems: async (_userId: string, itemType: string, itemKey: string) => {
        useItemsCalls.push({ itemType, itemKey })
        return true
      },
    },
    gameRepository: {
      getGenresById: async () => [],
      findGuessMatchCandidates: async (guessText: string) => {
        candidateLookups.push(guessText)
        return []
      },
    },
    funnelEventRepository: { record: async () => {} },
    positionSecondChanceRepository: { findPending: async () => null },
    positionLetterRevealRepository: {
      find: async () => null,
      findPending: async () => null,
      markApplied: async () => {},
    },
  } as unknown as GameServiceDeps

  const service = createGameService(deps)

  const submit = (position: number, text: string, extraBodyFields?: Record<string, unknown>) => {
    tierSession.round_position = position
    tierSession.round_started_at = new Date(Date.now() - 5000)
    return service.submitGuess({
      tierSessionId: tierSession.id,
      screenshotId: position,
      position,
      gameId: null,
      guessText: text,
      roundTimeTakenMs: 5000,
      userId: 'user-1',
      ...extraBodyFields,
    } as Parameters<typeof service.submitGuess>[0])
  }

  return { submit, guesses, tierSession, useItemsCalls, candidateLookups }
}

describe('game.service submitGuess — completion tally', () => {
  let h: ReturnType<typeof buildHarness>
  beforeEach(() => {
    h = buildHarness()
  })

  it('does NOT complete the challenge until all 10 screenshots are solved', async () => {
    for (let pos = 1; pos <= TOTAL_SCREENSHOTS - 1; pos++) {
      const res = await h.submit(pos, 'right')
      assert.equal(res.isCorrect, true)
      assert.equal(
        res.isCompleted,
        false,
        `challenge must not be complete after solving ${pos}/${TOTAL_SCREENSHOTS}`
      )
      assert.equal(res.screenshotsFound, pos, `screenshotsFound should equal solved count (${pos})`)
    }

    const last = await h.submit(TOTAL_SCREENSHOTS, 'right')
    assert.equal(last.isCompleted, true, 'challenge must complete on the 10th solved screenshot')
    assert.equal(last.completionReason, 'all_found')
    assert.equal(last.screenshotsFound, TOTAL_SCREENSHOTS)
  })

  it('rejects re-submitting a guess for an already-solved position (anti-replay)', async () => {
    const first = await h.submit(1, 'right')
    assert.equal(first.isCorrect, true)
    assert.equal(first.screenshotsFound, 1)

    await assert.rejects(
      () => h.submit(1, 'right'),
      (err: unknown) => err instanceof GameError && err.code === 'POSITION_ALREADY_SOLVED',
      'a second correct guess on the same position must be rejected'
    )

    assert.equal(
      h.guesses.filter((g) => g.isCorrect && g.position === 1).length,
      1,
      'only one correct guess row should exist for position 1'
    )
  })

  it('does NOT leak the answer on a wrong guess (no correctGame, no hints)', async () => {
    const wrong = await h.submit(1, 'nope')
    assert.equal(wrong.isCorrect, false)
    assert.equal(
      wrong.correctGame,
      undefined,
      'wrong-guess response must not contain the answer'
    )
    assert.ok(!JSON.stringify(wrong).includes('Halo'), 'response must not mention the game name')

    const correct = await h.submit(1, 'right')
    assert.equal(correct.correctGame?.name, 'Halo', 'correct guess reveals the answer')
  })

  it('still allows multiple wrong attempts on an unsolved position', async () => {
    const wrong1 = await h.submit(1, 'nope')
    assert.equal(wrong1.isCorrect, false)
    const wrong2 = await h.submit(1, 'still wrong')
    assert.equal(wrong2.isCorrect, false)
    const correct = await h.submit(1, 'right')
    assert.equal(correct.isCorrect, true)
    assert.equal(correct.screenshotsFound, 1)
  })
})

describe('game.service submitGuess — legacy metadata hints retired', () => {
  it('ignores a client-supplied powerUpUsed: no penalty, no inventory decrement, persists null', async () => {
    const h = buildHarness()
    const res = await h.submit(1, 'right', { powerUpUsed: 'hint_genre' })
    assert.equal(res.isCorrect, true)
    assert.equal(res.scoreEarned, 150, 'no hint penalty may be applied')
    assert.ok(
      !('hintPenalty' in res) || (res as Record<string, unknown>)['hintPenalty'] === undefined,
      'response must not carry a hintPenalty'
    )

    const saved = h.guesses[0]!
    assert.equal(saved.powerUpUsed, null, 'retired hint types must persist as null')
    assert.equal(saved.hintFromInventory, false)
    assert.equal(saved.scoreEarned, 150)
    assert.equal(
      h.useItemsCalls.length,
      0,
      'a stale powerUpUsed must never decrement inventory'
    )
  })

  it('persists powerUpUsed=null for a plain guess', async () => {
    const h = buildHarness()
    await h.submit(1, 'right')
    assert.equal(h.guesses[0]!.powerUpUsed, null)
    assert.equal(h.guesses[0]!.hintFromInventory, false)
  })
})

describe('game.service submitGuess — partial (franchise) scoring', () => {
  it('awards a reduced score and solves the position for a partial match', async () => {
    const h = buildHarness()
    const res = await h.submit(1, 'franchise')
    assert.equal(res.isCorrect, true, 'a franchise-level guess solves the screenshot')
    assert.equal(res.scoreEarned, 60, 'partial score = 40% of the exact (capped) score')
    assert.equal(res.matchPrecision, 'partial')
    assert.equal(res.screenshotsFound, 1, 'partial match counts as found')
    assert.equal(res.correctGame?.name, 'Halo', 'a solved partial reveals the answer')
  })

  it('keeps an exact match at full score and labels it exact', async () => {
    const h = buildHarness()
    const res = await h.submit(1, 'right')
    assert.equal(res.scoreEarned, 150)
    assert.equal(res.matchPrecision, 'exact')
  })

  it('a partial match is always worth less than the slowest exact (100)', async () => {
    const h = buildHarness()
    const res = await h.submit(1, 'franchise')
    assert.ok(res.scoreEarned < 100, 'partial must never reach the exact floor')
  })

  it('omits matchPrecision on a wrong guess', async () => {
    const h = buildHarness()
    const res = await h.submit(1, 'totally wrong')
    assert.equal(res.isCorrect, false)
    assert.equal(res.matchPrecision, undefined)
  })
})

describe('game.service submitGuess — proximity hint anti-oracle gate', () => {
  it('computes the proximity hint only on the FIRST wrong guess for a position', async () => {
    const h = buildHarness()

    await h.submit(1, 'wrong one')
    assert.deepEqual(
      h.candidateLookups,
      ['wrong one'],
      'first wrong guess should trigger a candidate lookup'
    )

    await h.submit(1, 'wrong two')
    assert.deepEqual(
      h.candidateLookups,
      ['wrong one'],
      'a repeat wrong guess on the same position must NOT look up candidates again'
    )
  })

  it('a wrong guess on a different position is still its own first attempt', async () => {
    const h = buildHarness()
    await h.submit(1, 'wrong a')
    await h.submit(2, 'wrong b')
    assert.deepEqual(
      h.candidateLookups,
      ['wrong a', 'wrong b'],
      'each position gets exactly one proximity lookup on its first miss'
    )
  })
})

describe('game.service submitGuess — session / screenshot binding', () => {
  let h: ReturnType<typeof buildHarness>
  beforeEach(() => {
    h = buildHarness()
  })

  it('rejects a screenshotId that is not the one served at that position', async () => {
    h.tierSession.round_position = 2
    h.tierSession.round_started_at = new Date(Date.now() - 5000)
    await assert.rejects(
      () => h.submit(2, 'right', { screenshotId: 1 }),
      (err: unknown) => err instanceof GameError && err.code === 'SCREENSHOT_POSITION_MISMATCH',
    )
    assert.equal(h.guesses.length, 0, 'no guess row may be written')
  })

  it('rejects guesses once the game session is completed (e.g. after forfeit)', async () => {
    h.tierSession.game_is_completed = true
    await assert.rejects(
      () => h.submit(1, 'right'),
      (err: unknown) => err instanceof GameError && err.code === 'SESSION_ALREADY_COMPLETED',
    )
    assert.equal(h.guesses.length, 0)
  })
})

describe('game.service submitGuess — in-game streak bonus', () => {
  it('adds the tier bonus server-side on a session started after the deploy', async () => {
    const h = buildHarness({ streakBonusEnabled: true })
    const scores: number[] = []
    for (let pos = 1; pos <= TOTAL_SCREENSHOTS; pos++) {
      const res = await h.submit(pos, 'right')
      scores.push(res.scoreEarned)
      if (pos === 3) {
        assert.equal(res.streakBonus, 25)
        assert.equal(res.streak, 3)
      }
    }
    assert.deepEqual(scores, [150, 150, 175, 150, 200, 150, 150, 150, 150, 250])
    assert.equal(h.tierSession.game_total_score, 150 * 10 + 175)
    assert.equal(h.tierSession.game_streak_bonus_total, 175)
    assert.equal(h.guesses[2]!.scoreEarned, 175)
  })

  it('does not change scoring for a session started before the deploy (no retroactive change)', async () => {
    const h = buildHarness({ streakBonusEnabled: false })
    for (let pos = 1; pos <= TOTAL_SCREENSHOTS; pos++) {
      const res = await h.submit(pos, 'right')
      assert.equal(res.scoreEarned, 150)
      assert.equal(res.streakBonus, undefined)
      assert.equal(res.streak, undefined)
    }
    assert.equal(h.tierSession.game_total_score, 1500)
    assert.equal(h.tierSession.game_streak_bonus_total, 0)
  })

  it('a wrong guess breaks the run', async () => {
    const h = buildHarness({ streakBonusEnabled: true })
    await h.submit(1, 'right')
    await h.submit(2, 'right')
    await h.submit(3, 'nope')
    const third = await h.submit(3, 'right')
    assert.equal(third.streakBonus, undefined, 'not a first try: no bonus')
    assert.equal(third.scoreEarned, 150)
    await h.submit(4, 'right')
    await h.submit(5, 'right')
    const sixth = await h.submit(6, 'right')
    assert.equal(sixth.streak, 3, 'the run restarts after the miss')
    assert.equal(sixth.streakBonus, 25)
  })

  it('ignores any client-supplied streak fields', async () => {
    const h = buildHarness({ streakBonusEnabled: true })
    const res = await h.submit(1, 'right', { streakBonus: 100, streak: 10 })
    assert.equal(res.scoreEarned, 150)
    assert.equal(res.streakBonus, undefined)
  })
})
