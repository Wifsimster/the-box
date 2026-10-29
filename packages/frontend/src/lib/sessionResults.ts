import type { GameSessionDetailsResponse, GuessResult, GuessAttempt } from '@/types'

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

export function countCorrect(results: GuessResult[]): number {
  return results.filter(r => r.isCorrect).length
}

export function computeAccuracy(correctAnswers: number, totalScreenshots: number): number {
  return totalScreenshots > 0 ? Math.round((correctAnswers / totalScreenshots) * 100) : 0
}

export interface ResultsSummary {
  totalScore: number
  totalScreenshots: number
  challengeDate: string | null
  authoritative: boolean
}

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
