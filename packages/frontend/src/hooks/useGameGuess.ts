import { useCallback } from 'react'
import type { Game } from '@the-box/types'
import { useGameStore } from '@/stores/gameStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import type { GuessSubmissionService } from '@/services/guessSubmissionService'
import {
  getErrorMessageKey,
  AuthenticationError,
  NotFoundError,
  logError,
} from '@/lib/errors'

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
          error: 'game.errors.sessionNotInitialized',
        }
      }

      const liveSegmentMs = store.roundStartedAt ? Date.now() - store.roundStartedAt : 0
      const accumulatedMs = store.positionStates[store.currentPosition]?.timeSpentMs ?? 0
      const roundTimeTakenMs = Math.max(0, accumulatedMs + liveSegmentMs)

      try {
        const result = await submissionService.submitGuess({
          tierSessionId: store.tierSessionId,
          screenshotId: store.currentScreenshotData.screenshotId,
          position: store.currentPosition,
          gameId: game?.id || null,
          guessText: userInput,
          roundTimeTakenMs,
        })

        if (result.newlyEarnedAchievements && result.newlyEarnedAchievements.length > 0) {
          achievementStore.addNotifications(result.newlyEarnedAchievements)
          achievementStore.fetchUserAchievements().catch(console.error)
        }

        store.recordAttempt(store.currentPosition, {
          guess: game?.name || userInput,
          isCorrect: result.isCorrect,
        })

        store.setScreenshotsFound(result.screenshotsFound)

        const currentPos = store.currentPosition

        if (result.isCorrect) {
          store.updatePositionState(currentPos, {
            status: 'correct',
            isCorrect: true,
            proximityHint: undefined,
          })
        } else {
          store.updatePositionState(currentPos, {
            isCorrect: false,
            ...(result.proximityHint ? { proximityHint: result.proximityHint } : {}),
          })
          store.markIncorrectGuess(currentPos)

          const inv = dailyLoginStore.inventory
          const ownsSecondChance = (inv?.powerups['second_chance'] ?? 0) > 0
          const alreadyActive =
            store.positionStates[currentPos]?.secondChanceActivated === true
          if (ownsSecondChance && !alreadyActive) {
            store.showSecondChancePrompt(currentPos)
          }
        }

        const shouldAdvance = result.isCorrect

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
            streakBonus: result.streakBonus,
            streak: result.streak,
            matchPrecision: result.matchPrecision,
            attempts,
          })
        }

        if (result.isCorrect) {
          store.incrementCorrectAnswers()
        }

        store.updateScore(result.totalScore)

        if (result.isCompleted) {
          store.setIsSessionCompleted(true)

          store.setGamePhase('challenge_complete')
        } else if (shouldAdvance) {
          const hasVisitedAll = store.hasVisitedAllPositions()
          const hasSkipped = store.hasSkippedPositions()

          if (result.isCorrect && hasVisitedAll && hasSkipped) {
            store.setGamePhase('result')
            store.setPendingCompletionChoice(true)
          } else {
            store.setGamePhase('result')
          }
        }

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
        logError(error, 'useGameGuess')

        const userMessage = getErrorMessageKey(error)

        if (error instanceof AuthenticationError) {
          console.warn('Authentication required for guess submission')
        } else if (error instanceof NotFoundError) {
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
