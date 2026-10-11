import type { GameSessionDetailsResponse, GuessResult, GuessAttempt } from '@/types'

/**
 * Flatten a {@link GameSessionDetailsResponse} into a single, position-sorted
 * `GuessResult[]`. Unfound games (skipped / timed-out) are folded in as
 * incorrect entries worth `0` points so they render alongside real guesses.
 * They are still flagged as misses via `isCorrect: false` + `userGuess: null`;
 * the score is `0` because the backend applies no unfound penalty
 * (`UNFOUND_PENALTY = 0`).
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
      scoreEarned: 0,
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

/** What the results page shows for the score hero. */
export interface ResultsSummary {
  totalScore: number
  totalScreenshots: number
  challengeDate: string | null
  /** True once the numbers come from the server's session record. */
  authoritative: boolean
}

/**
 * Pick the results page's score, preferring the server's session record over
 * the persisted local store. The store can be stale: a session finished on
 * another device leaves this device's localStorage at the partial score it
 * last saw. The store is only an optimistic placeholder until the session
 * record for the same session id arrives, or the fallback if it never does.
 */
export function resolveResultsSummary(
  store: { sessionId: string | null; totalScore: number; totalScreenshots: number; challengeDate: string | null },
  session: Pick<GameSessionDetailsResponse, 'sessionId' | 'totalScore' | 'totalScreenshots' | 'challengeDate'> | null,
): ResultsSummary {
  if (session && (store.sessionId === null || session.sessionId === store.sessionId)) {
    return {
      totalScore: session.totalScore,
      totalScreenshots: session.totalScreenshots,
      challengeDate: session.challengeDate,
      authoritative: true,
    }
  }
  return {
    totalScore: store.totalScore,
    totalScreenshots: store.totalScreenshots,
    challengeDate: store.challengeDate,
    authoritative: false,
  }
}
