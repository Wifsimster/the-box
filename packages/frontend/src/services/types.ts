import type { Game, TierScreenshot } from '@the-box/types'

/**
 * Service interface for game search functionality
 */
export interface GameSearchService {
  search(query: string): Promise<Game[]>
}

/**
 * Service interface for score calculation
 */
export interface ScoringService {
  calculateScore(timeTakenMs: number, isCorrect: boolean): number
}

/**
 * Leaderboard entry interface
 */
export interface LeaderboardEntry {
  username: string
  totalScore: number
  rank?: number
}

/**
 * Service interface for leaderboard operations
 */
export interface LeaderboardService {
  getTodayLeaderboard(): Promise<LeaderboardEntry[]>
  getWorldTotalScore(): Promise<number>
}

/**
 * Guess validation result
 */
export interface GuessValidation {
  isCorrect: boolean
  correctGame: Game
}

/**
 * Service interface for game validation
 */
export interface GameValidationService {
  validateGuess(
    guessedGame: Game | null,
    screenshot: TierScreenshot | null
  ): Promise<GuessValidation>
}
