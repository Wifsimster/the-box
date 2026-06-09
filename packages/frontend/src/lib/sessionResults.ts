import type { GameSessionDetailsResponse, GuessResult, GuessAttempt } from '@/types'

/**
 * Flatten a {@link GameSessionDetailsResponse} into a single, position-sorted
 * `GuessResult[]`. Unfound games (skipped / timed-out) are folded in as
 * incorrect entries with the `-50` miss penalty so they render alongside real
 * guesses.
 *
 * This is the one place the guesses + unfoundGames merge lives — ResultsPage,
 * GameHistoryDetailsPage and the leaderboard PlayerAnswersDialog all share it
 * instead of each re-deriving the same shape.
 */
export function mergeSessionResults(session: GameSessionDetailsResponse): GuessResult[] {
  const merged: GuessResult[] = [
    ...session.guesses.map(g => ({
      position: g.position,
      isCorrect: g.isCorrect,
      correctGame: g.correctGame,
      userGuess: g.userGuess,
      timeTakenMs: g.timeTakenMs,
      scoreEarned: g.scoreEarned,
      hintPenalty: g.hintPenalty,
      wrongGuessPenalty: g.wrongGuessPenalty,
      screenshot: g.screenshot,
      attempts: g.attempts ?? [],
    })),
    ...session.unfoundGames.map(u => ({
      position: u.position,
      isCorrect: false,
      correctGame: u.game,
      userGuess: null,
      timeTakenMs: 0,
      scoreEarned: -50,
      screenshot: u.screenshot,
      attempts: [] as GuessAttempt[],
    })),
  ]
  return merged.sort((a, b) => a.position - b.position)
}

/** Number of correctly guessed positions in a merged result set. */
export function countCorrect(results: GuessResult[]): number {
  return results.filter(r => r.isCorrect).length
}

/** Accuracy as a whole-number percentage, guarding against divide-by-zero. */
export function computeAccuracy(correctAnswers: number, totalScreenshots: number): number {
  return totalScreenshots > 0 ? Math.round((correctAnswers / totalScreenshots) * 100) : 0
}
