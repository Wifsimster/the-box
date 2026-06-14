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
 * - Letter-reveal penalty: locked in server-side at reveal time
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

      // Total active time on this screenshot = time banked on previous visits
      // plus the current segment. Sending the accumulated value (not just the
      // current segment) stops the skip-away-and-back trick from also resetting
      // the speed multiplier — the server takes Math.max(server, client), so
      // the honest larger time wins with no backend change.
      const liveSegmentMs = store.roundStartedAt ? Date.now() - store.roundStartedAt : 0
      const accumulatedMs = store.positionStates[store.currentPosition]?.timeSpentMs ?? 0
      const roundTimeTakenMs = Math.max(0, accumulatedMs + liveSegmentMs)

      try {
        // Submit guess to service (handles validation + scoring)
        const result = await submissionService.submitGuess({
          tierSessionId: store.tierSessionId,
          screenshotId: store.currentScreenshotData.screenshotId,
          position: store.currentPosition,
          gameId: game?.id || null,
          guessText: userInput,
          roundTimeTakenMs,
        })

        // Handle newly earned achievements
        if (result.newlyEarnedAchievements && result.newlyEarnedAchievements.length > 0) {
          achievementStore.addNotifications(result.newlyEarnedAchievements)
          // Refresh user achievements
          achievementStore.fetchUserAchievements().catch(console.error)
        }

        // Always record the attempt (wrong or correct) so the results
        // page can display the full list of guesses per position.
        store.recordAttempt(store.currentPosition, {
          guess: game?.name || userInput,
          isCorrect: result.isCorrect,
        })

        // Update screenshots found
        store.setScreenshotsFound(result.screenshotsFound)

        // Update position state for navigation tracking
        const currentPos = store.currentPosition

        if (result.isCorrect) {
          // Mark position as correct and clear any lingering "warmer" hint.
          store.updatePositionState(currentPos, {
            status: 'correct',
            isCorrect: true,
            proximityHint: undefined,
          })
        } else {
          // Wrong guess - stay on current position and mark as having incorrect
          // guess. Surface the smart-guess "warmer" hint when the server could
          // relate this guess to the answer; keep the previous one otherwise so
          // an unrelated follow-up guess doesn't wipe a useful clue.
          store.updatePositionState(currentPos, {
            isCorrect: false,
            ...(result.proximityHint ? { proximityHint: result.proximityHint } : {}),
          })
          store.markIncorrectGuess(currentPos)

          // Surface the second-chance modal: only when the user actually
          // owns the powerup AND has not already activated it for this
          // position in this session. The modal is dismissable; declining
          // does NOT consume inventory (per the powerups PRD).
          const inv = dailyLoginStore.inventory
          const ownsSecondChance = (inv?.powerups['second_chance'] ?? 0) > 0
          const alreadyActive =
            store.positionStates[currentPos]?.secondChanceActivated === true
          if (ownsSecondChance && !alreadyActive) {
            store.showSecondChancePrompt(currentPos)
          }
        }

        // Determine if we should advance to next screenshot (only on correct)
        const shouldAdvance = result.isCorrect

        // Record result only when advancing (to show in result screen).
        // correctGame is always present on a correct guess — the server
        // only omits it on wrong guesses (anti-leak).
        if (shouldAdvance && result.correctGame) {
          const attempts = store.positionAttempts[store.currentPosition] ?? []
          store.addGuessResult({
            position: store.currentPosition,
            isCorrect: result.isCorrect,
            correctGame: result.correctGame,
            userGuess: game?.name || userInput,
            timeTakenMs: roundTimeTakenMs,
            scoreEarned: result.scoreEarned,
            letterPenalty: result.letterPenalty,
            wrongGuessPenalty: result.wrongGuessPenalty,
            attempts,
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
