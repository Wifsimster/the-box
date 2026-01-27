import { useCallback } from 'react'
import type { Game } from '@the-box/types'
import { useGameStore } from '@/stores/gameStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
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
 * Speed-based scoring system:
 * - Uses roundTimeTakenMs (time per screenshot) for speed multiplier calculation
 * - Wrong guesses: -30 points per incorrect attempt
 * - Base score: 100 points, multiplied by speed factor (capped at 200)
 * - Hint penalty: -20% of earned score
 */
export function useGameGuess(submissionService: GuessSubmissionService) {
  const store = useGameStore()
  const achievementStore = useAchievementStore()
  const dailyLoginStore = useDailyLoginStore()

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

      // Calculate round time (from current screenshot start to now)
      const roundTimeTakenMs = store.roundStartedAt
        ? Date.now() - store.roundStartedAt
        : 0

      // Check if hints were used for current position
      const currentPosState = store.positionStates[store.currentPosition]
      const hintYearUsed = currentPosState?.hintYearUsed || false
      const hintPublisherUsed = currentPosState?.hintPublisherUsed || false
      const hintDeveloperUsed = currentPosState?.hintDeveloperUsed || false

      // Determine which power-up was used (send one hint type for penalty calculation)
      // Priority: developer > publisher > year (most valuable first)
      let powerUpUsed: 'hint_year' | 'hint_publisher' | 'hint_developer' | undefined
      if (hintDeveloperUsed) {
        powerUpUsed = 'hint_developer'
      } else if (hintPublisherUsed) {
        powerUpUsed = 'hint_publisher'
      } else if (hintYearUsed) {
        powerUpUsed = 'hint_year'
      }

      try {
        // Submit guess to service (handles validation + scoring)
        const result = await submissionService.submitGuess({
          tierSessionId: store.tierSessionId,
          screenshotId: store.currentScreenshotData.screenshotId,
          position: store.currentPosition,
          gameId: game?.id || null,
          guessText: userInput,
          roundTimeTakenMs,
          powerUpUsed,
        })

        // Handle newly earned achievements
        if (result.newlyEarnedAchievements && result.newlyEarnedAchievements.length > 0) {
          achievementStore.addNotifications(result.newlyEarnedAchievements)
          // Refresh user achievements
          achievementStore.fetchUserAchievements().catch(console.error)
        }

        // Refresh inventory if hint was used from inventory (to update UI count)
        if (result.hintFromInventory) {
          dailyLoginStore.fetchInventory().catch(console.error)
        }

        // Update screenshots found
        store.setScreenshotsFound(result.screenshotsFound)

        // Store available hints for current position
        if (result.availableHints) {
          store.setAvailableHints(result.availableHints)
        }

        // Update position state for navigation tracking
        const currentPos = store.currentPosition

        if (result.isCorrect) {
          // Mark position as correct
          store.updatePositionState(currentPos, {
            status: 'correct',
            isCorrect: true,
          })
        } else {
          // Wrong guess - stay on current position and mark as having incorrect guess
          store.updatePositionState(currentPos, {
            isCorrect: false,
          })
          store.markIncorrectGuess(currentPos)
        }

        // Determine if we should advance to next screenshot (only on correct)
        const shouldAdvance = result.isCorrect

        // Record result only when advancing (to show in result screen)
        if (shouldAdvance) {
          store.addGuessResult({
            position: store.currentPosition,
            isCorrect: result.isCorrect,
            correctGame: result.correctGame,
            userGuess: game?.name || userInput,
            timeTakenMs: roundTimeTakenMs,
            scoreEarned: result.scoreEarned,
            hintPenalty: result.hintPenalty,
            wrongGuessPenalty: result.wrongGuessPenalty,
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
          // Mark session as completed in state
          store.setIsSessionCompleted(true)

          // Session is done - go directly to results page
          store.setGamePhase('challenge_complete')
        } else if (shouldAdvance) {
          // Check if we should show the completion choice modal
          // Trigger conditions: visited all positions, made a correct guess, and still have skipped positions
          const hasVisitedAll = store.hasVisitedAllPositions()
          const hasSkipped = store.hasSkippedPositions()

          if (result.isCorrect && hasVisitedAll && hasSkipped) {
            // Show completion choice modal instead of auto-navigating
            store.setGamePhase('result')
            store.setShowCompletionChoice(true)
          } else {
            // Show result screen before advancing to next screenshot
            store.setGamePhase('result')
          }
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
    [submissionService, store, achievementStore, dailyLoginStore]
  )

  return {
    submitGuess,
  }
}
