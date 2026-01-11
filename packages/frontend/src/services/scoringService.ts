import type { ScoringService } from './types'

/**
 * Timer-based scoring implementation
 *
 * Scoring algorithm:
 * - Correct answer: Base score of 200 points minus 5 points per second
 * - Minimum score for correct answer: 50 points
 * - Incorrect answer: 0 points
 */
export class TimerBasedScoringService implements ScoringService {
  private readonly baseScore = 200
  private readonly penaltyPerSecond = 5
  private readonly minimumScore = 50

  calculateScore(timeTakenMs: number, isCorrect: boolean): number {
    if (!isCorrect) {
      return 0
    }

    const secondsTaken = Math.floor(timeTakenMs / 1000)
    const score = this.baseScore - secondsTaken * this.penaltyPerSecond

    return Math.max(score, this.minimumScore)
  }
}

/**
 * Factory function to create the default scoring service
 */
export function createScoringService(): ScoringService {
  return new TimerBasedScoringService()
}
