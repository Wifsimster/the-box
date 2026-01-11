import { useCallback } from 'react'
import type { Game } from '@the-box/types'
import { useGameStore } from '@/stores/gameStore'
import type { GuessSubmissionService } from '@/services/guessSubmissionService'
import {
  getUserFriendlyErrorMessage,
  AuthenticationError,
  NotFoundError,
  logError,
} from '@/lib/errors'

/**
 * Custom hook for handling game guess submission logic
 *
 * Refactored for countdown scoring system:
 * - Uses sessionElapsedMs instead of per-screenshot time
 * - Handles tries remaining per screenshot
 * - Score countdown continues until game completion
 */
export function useGameGuess(submissionService: GuessSubmissionService) {
  const store = useGameStore()

  const submitGuess = useCallback(
    async (game: Game | null, userInput: string) => {
      if (!store.tierSessionId || !store.currentScreenshot) {
        console.error('Missing session or screenshot data')
        return {
          success: false,
          isCorrect: false,
          scoreEarned: 0,
          error: 'Session not initialized',
        }
      }

      // Calculate session elapsed time (from session start, not per-screenshot)
      const sessionElapsedMs = store.sessionStartedAt
        ? Date.now() - store.sessionStartedAt
        : 0

      try {
        // Submit guess to service (handles validation + scoring)
        const result = await submissionService.submitGuess({
          tierSessionId: store.tierSessionId,
          screenshotId: store.currentScreenshot.id,
          position: store.currentPosition,
          gameId: game?.id || null,
          guessText: userInput,
          sessionElapsedMs,
        })

        // Update tries remaining and screenshots found
        store.setTriesRemaining(result.triesRemaining)
        store.setScreenshotsFound(result.screenshotsFound)

        // Determine if we should advance to next screenshot
        const shouldAdvance = result.isCorrect || result.triesRemaining === 0

        // Record result only when advancing (to show in result screen)
        if (shouldAdvance) {
          store.addGuessResult({
            position: store.currentPosition,
            isCorrect: result.isCorrect,
            correctGame: result.correctGame,
            userGuess: game?.name || userInput,
            timeTakenMs: sessionElapsedMs,
            scoreEarned: result.scoreEarned,
          })
        }

        // Update stats
        if (result.isCorrect) {
          store.incrementCorrectAnswers()
        }

        // Update total score from server (locked-in score)
        store.updateScore(result.totalScore)

        // Handle game phase transitions
        if (result.isCompleted) {
          // Stop the countdown and show completion
          store.stopScoreCountdown()
          store.setGamePhase('challenge_complete')
        } else if (shouldAdvance) {
          // Show result screen before advancing to next screenshot
          store.setGamePhase('result')
        }
        // If not advancing (wrong guess, tries remaining), stay in playing phase

        return {
          success: true,
          isCorrect: result.isCorrect,
          scoreEarned: result.scoreEarned,
          totalScore: result.totalScore,
          triesRemaining: result.triesRemaining,
          screenshotsFound: result.screenshotsFound,
          nextPosition: result.nextPosition,
          isCompleted: result.isCompleted,
          completionReason: result.completionReason,
          shouldAdvance,
        }
      } catch (error) {
        // Log error with context
        logError(error, 'useGameGuess')

        // Get user-friendly error message
        const userMessage = getUserFriendlyErrorMessage(error)

        // Handle specific error types
        if (error instanceof AuthenticationError) {
          // Could redirect to login or show auth modal
          console.warn('Authentication required for guess submission')
        } else if (error instanceof NotFoundError) {
          // Session might have expired
          console.warn('Session or screenshot not found')
        }

        return {
          success: false,
          isCorrect: false,
          scoreEarned: 0,
          error: userMessage,
        }
      }
    },
    [submissionService, store]
  )

  const skipRound = useCallback(
    async () => {
      // Skip exhausts all remaining tries for this screenshot
      // Submit with null game to use up a try
      return submitGuess(null, '')
    },
    [submitGuess]
  )

  return {
    submitGuess,
    skipRound,
  }
}
