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
 * Refactored to use unified guessSubmissionService that handles
 * validation and scoring in a single API call
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

      // Calculate time taken, ensuring no NaN from null values
      const timeTakenMs = store.timerStartedAt
        ? Date.now() - store.timerStartedAt
        : 0

      try {
        // Submit guess to service (handles validation + scoring)
        const result = await submissionService.submitGuess({
          tierSessionId: store.tierSessionId,
          screenshotId: store.currentScreenshot.id,
          position: store.currentPosition,
          gameId: game?.id || null,
          guessText: userInput,
          timeTakenMs,
        })

        // Pause timer
        store.pauseTimer()

        // Record result
        store.addGuessResult({
          position: store.currentPosition,
          isCorrect: result.isCorrect,
          correctGame: result.correctGame,
          userGuess: game?.name || userInput,
          timeTakenMs,
          scoreEarned: result.scoreEarned,
        })

        // Update stats
        if (result.isCorrect) {
          store.incrementCorrectAnswers()
        }

        // Update total score from server
        store.updateScore(result.totalScore)

        // Transition to result phase
        store.setGamePhase('result')

        // Check if challenge is completed
        if (result.isCompleted) {
          store.setGamePhase('challenge_complete')
        }

        return {
          success: true,
          isCorrect: result.isCorrect,
          scoreEarned: result.scoreEarned,
          totalScore: result.totalScore,
          nextPosition: result.nextPosition,
          isCompleted: result.isCompleted,
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

        // Pause timer even on error
        store.pauseTimer()

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
      // Skip is just submitting with null game
      return submitGuess(null, '')
    },
    [submitGuess]
  )

  return {
    submitGuess,
    skipRound,
  }
}
