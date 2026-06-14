import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createGameService, GameError, type GameServiceDeps } from './game.service.js'
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

const TOTAL_SCREENSHOTS = 10

/**
 * Minimal in-memory test harness for `submitGuess`. The real service talks to
 * Postgres via injected repository ports; here we model just enough of the
 * `guesses` / `tier_sessions` tables to exercise the completion-tally and
 * anti-replay logic, which is where the two bugs found by the persona bug
 * hunt live:
 *
 *  1. Off-by-one completion: `saveGuess` runs BEFORE `getCorrectAnswersCount`,
 *     so the count already includes the current correct guess; the extra
 *     `+ (isCorrect ? 1 : 0)` in the service double-counted it and the
 *     challenge finished after 9 of 10 screenshots.
 *  2. Replay: nothing stopped a client from re-POSTing a winning answer for a
 *     position it had already solved (the round-timer guard only checks
 *     `round_position === position`, which is never cleared after a correct
 *     guess), re-banking score and inserting another correct row.
 */
function buildHarness() {
  const guesses: Array<{
    position: number
    isCorrect: boolean
    powerUpUsed: string | null
    hintFromInventory: boolean
    scoreEarned: number
  }> = []
  // Records every inventoryRepository.useItems call so the retirement
  // tests can prove a stale client's powerUpUsed never touches inventory.
  const useItemsCalls: Array<{ itemType: string; itemKey: string }> = []
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
    // Mirrors the repository: number of DISTINCT positions with a correct
    // guess. The just-saved guess is already visible here (autocommitted on a
    // pooled connection before this read), exactly as in production.
    getCorrectAnswersCount: async () => {
      const solved = new Set(guesses.filter((g) => g.isCorrect).map((g) => g.position))
      return solved.size
    },
    hasCorrectGuessForPosition: async (_id: string, position: number) =>
      guesses.some((g) => g.isCorrect && g.position === position),
    hasWrongGuessForPosition: async (_id: string, position: number) =>
      guesses.some((g) => !g.isCorrect && g.position === position),
    updateTierSession: async (
      _id: string,
      data: { score: number; correctAnswers: number; wrongGuesses: number }
    ) => {
      tierSession.score = data.score
      tierSession.correct_answers = data.correctAnswers
      tierSession.wrong_guesses = data.wrongGuesses
    },
    updateGameSession: async (_id: string, data: { totalScore: number }) => {
      tierSession.game_total_score = data.totalScore
    },
    findAchievementGuessData: async () => [],
  }

  const deps = {
    logger: silentLogger,
    fuzzyMatchService: {
      // The harness submits the literal answer 'right' for a correct guess.
      isMatch: (guess: string) => guess.trim() === 'right',
      // Graded matcher used by submitGuess: 'right' = exact full title,
      // 'franchise' = partial (franchise named, number omitted), else none.
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
    challengeRepository: {},
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
    gameRepository: { getGenresById: async () => [] },
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
    // Simulate the client fetching the screenshot for `position`, which is the
    // only thing that stamps the round timer server-side.
    tierSession.round_position = position
    tierSession.round_started_at = new Date(Date.now() - 5000)
    // `extraBodyFields` simulates a stale client smuggling retired fields
    // (e.g. powerUpUsed) past the route's destructuring — the service
    // contract is accept-and-ignore, never 400.
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

  return { submit, guesses, tierSession, useItemsCalls }
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

    // The replay must not have banked a second correct row or extra score.
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
    // A correct guess after wrong attempts must still be accepted.
    const correct = await h.submit(1, 'right')
    assert.equal(correct.isCorrect, true)
    assert.equal(correct.screenshotsFound, 1)
  })
})

describe('game.service submitGuess — legacy metadata hints retired', () => {
  it('ignores a client-supplied powerUpUsed: no penalty, no inventory decrement, persists null', async () => {
    const h = buildHarness()
    // A stale client still sending the retired field must get a normal,
    // full-score guess back — never a 400, never a penalty.
    const res = await h.submit(1, 'right', { powerUpUsed: 'hint_genre' })
    assert.equal(res.isCorrect, true)
    // 5s round → 1.5x multiplier → 150 points, untouched by the retired
    // 20% metadata-hint penalty.
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
    // 5s round → exact would be 150; partial = round(150 × 0.4) = 60.
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
