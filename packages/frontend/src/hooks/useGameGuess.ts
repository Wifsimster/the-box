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
      if (!store.tierSessionId || !store.currentScreenshotData) {
        console.error('Missing session or screenshot data')
        return {
          success: false,
          isCorrect: false,
          scoreEarned: 0,
          error: 'Session not initialized',
        }
      }

      // Calculate session elapsed time (for scoring - from session start)
      const sessionElapsedMs = store.sessionStartedAt
        ? Date.now() - store.sessionStartedAt
        : 0

      // Calculate round time (for display - from current screenshot start)
      const roundTimeTakenMs = store.roundStartedAt
        ? Date.now() - store.roundStartedAt
        : 0

      // Capture the current countdown score for display (what the user sees)
      const currentCountdownScore = store.currentScore

      try {
        // Submit guess to service (handles validation + scoring)
        const result = await submissionService.submitGuess({
          tierSessionId: store.tierSessionId,
          screenshotId: store.currentScreenshotData.screenshotId,
          position: store.currentPosition,
          gameId: game?.id || null,
          guessText: userInput,
          sessionElapsedMs,
        })

        // Update screenshots found
        store.setScreenshotsFound(result.screenshotsFound)

        // Update position state for navigation tracking
        const currentPos = store.currentPosition

        if (result.isCorrect) {
          // Mark position as correct
          store.updatePositionState(currentPos, {
            status: 'correct',
            isCorrect: true,
          })
        } else {
          // Wrong guess - stay on current position
          store.updatePositionState(currentPos, {
            isCorrect: false,
          })
        }

        // Determine if we should advance to next screenshot (only on correct)
        const shouldAdvance = result.isCorrect

        // Record result only when advancing (to show in result screen)
        if (shouldAdvance) {
          // Use the captured countdown score for correct guesses (what user was seeing)
          // For incorrect guesses, scoreEarned is 0
          const displayScore = result.isCorrect ? currentCountdownScore : 0

          store.addGuessResult({
            position: store.currentPosition,
            isCorrect: result.isCorrect,
            correctGame: result.correctGame,
            userGuess: game?.name || userInput,
            timeTakenMs: roundTimeTakenMs,
            scoreEarned: displayScore,
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

  return {
    submitGuess,
  }
}
