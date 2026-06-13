import { describe, it } from 'node:test'
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

/**
 * In-memory harness for the letter-reveal flow, modeled on the submit-guess
 * harness. Exercises the full contract: the wrong-guess gate, the per-title
 * cap, ranked-daily inventory gating, premium-in-catch-up free reveals, and
 * the penalty deduction in submitGuess (applied after the 200 cap, before
 * the second-chance floor, exactly once thanks to the anti-replay guard).
 */
function buildHarness(opts: { letterItems?: number; isCatchUp?: boolean } = {}) {
  const GAME_NAME = 'Elden Ring' // 9 maskable letters → cap 2
  let letterItems = opts.letterItems ?? 0

  const guesses: Array<{
    position: number
    isCorrect: boolean
    scoreEarned: number
  }> = []
  const revealRows = new Map<
    string,
    {
      id: number
      tier_session_id: string
      position: number
      letters_revealed: number
      penalty_pct: number
      last_revealed_at: Date
      applied_to_guess_id: number | null
    }
  >()

  const tierSession = {
    id: 'tier-1',
    user_id: 'user-1',
    game_session_id: 'game-1',
    daily_challenge_id: 1,
    is_catch_up: opts.isCatchUp ?? false,
    round_started_at: new Date(Date.now() - 5000) as Date | null,
    round_position: 1 as number | null,
    score: 0,
    correct_answers: 0,
    wrong_guesses: 0,
    game_total_score: 0,
  }

  const deps = {
    logger: silentLogger,
    fuzzyMatchService: {
      isMatch: (guess: string) => guess.trim() === 'right',
    },
    achievementService: { checkAchievementsAfterGame: async () => [] },
    challengeRepository: {
      findTiersByChallenge: async () => [{ id: 7, time_limit_seconds: 45 }],
      findScreenshotAtPosition: async (_tierId: number, position: number) => ({
        screenshot_id: position,
        position,
        image_url: '/uploads/x.jpg',
        bonus_multiplier: '1.0',
      }),
    },
    sessionRepository: {
      withTierSessionLock: async <T>(_id: string, fn: () => Promise<T>) => fn(),
      findTierSessionWithContext: async () => ({ ...tierSession }),
      saveGuess: async (data: { position: number; isCorrect: boolean; scoreEarned: number }) => {
        guesses.push({
          position: data.position,
          isCorrect: data.isCorrect,
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
      updateTierSession: async () => {},
      updateGameSession: async () => {},
      findAchievementGuessData: async () => [],
    },
    screenshotRepository: {
      findWithGame: async () => ({
        screenshot: { gameId: 99 },
        gameName: GAME_NAME,
        coverImageUrl: null,
        aliases: [],
        releaseYear: 2022,
        metacritic: null,
      }),
      getGameByScreenshotId: async () => ({ publisher: 'BN', developer: 'FromSoftware' }),
    },
    userRepository: {
      findById: async () => ({ currentStreak: 0 }),
      updateStreak: async () => {},
      updateScore: async () => {},
    },
    inventoryRepository: {
      useItems: async (_u: string, _t: string, key: string) => {
        if (key !== 'hint_letter') return false
        if (letterItems < 1) return false
        letterItems--
        return true
      },
    },
    gameRepository: { getGenresById: async () => [] },
    funnelEventRepository: { record: async () => {} },
    positionSecondChanceRepository: { findPending: async () => null },
    positionLetterRevealRepository: {
      find: async (tierSessionId: string, position: number) =>
        revealRows.get(`${tierSessionId}:${position}`) ?? null,
      recordReveal: async (input: {
        tierSessionId: string
        position: number
        addPenaltyPct: number
      }) => {
        const key = `${input.tierSessionId}:${input.position}`
        const existing = revealRows.get(key)
        const row = existing
          ? {
              ...existing,
              letters_revealed: existing.letters_revealed + 1,
              penalty_pct: existing.penalty_pct + input.addPenaltyPct,
              last_revealed_at: new Date(),
            }
          : {
              id: revealRows.size + 1,
              tier_session_id: input.tierSessionId,
              position: input.position,
              letters_revealed: 1,
              penalty_pct: input.addPenaltyPct,
              last_revealed_at: new Date(),
              applied_to_guess_id: null,
            }
        revealRows.set(key, row)
        return row
      },
      findPending: async (tierSessionId: string, position: number) => {
        const row = revealRows.get(`${tierSessionId}:${position}`)
        return row && row.applied_to_guess_id === null ? row : null
      },
      markApplied: async () => {},
    },
  } as unknown as GameServiceDeps

  const service = createGameService(deps)

  const submit = (position: number, text: string) => {
    tierSession.round_position = position
    tierSession.round_started_at = new Date(Date.now() - 5000) // 1.5x → 150 pts
    return service.submitGuess({
      tierSessionId: tierSession.id,
      screenshotId: position,
      position,
      gameId: null,
      guessText: text,
      roundTimeTakenMs: 5000,
      userId: 'user-1',
    })
  }

  const reveal = (position: number, isPremium = false) =>
    service.revealLetter({
      tierSessionId: tierSession.id,
      position,
      userId: 'user-1',
      isPremium,
    })

  return { submit, reveal, guesses, get letterItems() { return letterItems } }
}

describe('game.service revealLetter — gating', () => {
  it('rejects the first paid letter before any wrong guess (hybrid gate)', async () => {
    const h = buildHarness({ letterItems: 2 })
    await assert.rejects(
      () => h.reveal(1),
      (err: unknown) => err instanceof GameError && err.code === 'LETTER_LOCKED'
    )
  })

  it('rejects reveals on an already-solved position', async () => {
    const h = buildHarness({ letterItems: 2 })
    await h.submit(1, 'right')
    await assert.rejects(
      () => h.reveal(1),
      (err: unknown) => err instanceof GameError && err.code === 'POSITION_ALREADY_SOLVED'
    )
  })

  it('caps reveals per title and 409s beyond the cap', async () => {
    const h = buildHarness({ letterItems: 5 })
    await h.submit(1, 'wrong')
    const r1 = await h.reveal(1)
    assert.equal(r1.maskedTitle, 'E____ ____')
    const r2 = await h.reveal(1)
    assert.equal(r2.maskedTitle, 'El___ ____')
    assert.equal(r2.lettersRevealed, 2)
    assert.equal(r2.nextPenaltyPct, null)
    await assert.rejects(
      () => h.reveal(1),
      (err: unknown) => err instanceof GameError && err.code === 'LETTER_CAP_REACHED'
    )
  })
})

describe('game.service revealLetter — economy', () => {
  it('ranked daily: consumes one hint_letter item per reveal AND accrues the penalty', async () => {
    const h = buildHarness({ letterItems: 2, isCatchUp: false })
    await h.submit(1, 'wrong')

    const r1 = await h.reveal(1)
    assert.equal(r1.fromInventory, true)
    assert.equal(r1.penaltyPct, 15, 'score cost applies even from inventory')
    assert.equal(h.letterItems, 1)

    const r2 = await h.reveal(1)
    assert.equal(r2.penaltyPct, 35, 'convex schedule: 15 then +20')
    assert.equal(h.letterItems, 0)
  })

  it('ranked daily: 402 NO_INVENTORY when the player owns no items', async () => {
    const h = buildHarness({ letterItems: 0, isCatchUp: false })
    await h.submit(1, 'wrong')
    await assert.rejects(
      () => h.reveal(1),
      (err: unknown) =>
        err instanceof GameError && err.code === 'NO_INVENTORY' && err.statusCode === 402
    )
  })

  it('catch-up: no inventory needed, penalty still accrues for non-premium', async () => {
    const h = buildHarness({ letterItems: 0, isCatchUp: true })
    await h.submit(1, 'wrong')
    const r = await h.reveal(1)
    assert.equal(r.fromInventory, false)
    assert.equal(r.penaltyPct, 15)
  })

  it('catch-up + premium: reveal is free (no penalty, no inventory)', async () => {
    const h = buildHarness({ letterItems: 0, isCatchUp: true })
    await h.submit(1, 'wrong')
    const r = await h.reveal(1, true)
    assert.equal(r.fromInventory, false)
    assert.equal(r.penaltyPct, 0)
    assert.equal(r.lettersRevealed, 1)
  })
})

describe('game.service submitGuess — letter penalty', () => {
  it('deducts the accrued percent from the correct guess, after the cap', async () => {
    const h = buildHarness({ letterItems: 2 })
    await h.submit(1, 'wrong')
    await h.reveal(1)
    await h.reveal(1) // cumulative 35%

    const res = await h.submit(1, 'right')
    // 5s round → 1.5x → 150 pts, minus 35% letter penalty (52.5 → 53).
    assert.equal(res.letterPenalty, 53)
    assert.equal(res.scoreEarned, 97)
    assert.equal(h.guesses.at(-1)!.scoreEarned, 97, 'persisted score carries the penalty')
  })

  it('no letter penalty when nothing was revealed', async () => {
    const h = buildHarness()
    const res = await h.submit(1, 'right')
    assert.equal(res.letterPenalty, undefined)
    assert.equal(res.scoreEarned, 150)
  })
})
