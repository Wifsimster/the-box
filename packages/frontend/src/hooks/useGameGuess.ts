import { useCallback } from 'react'
import type { Game } from '@the-box/types'
import { useGameStore } from '@/stores/gameStore'
import type {
  GameValidationService,
  ScoringService,
} from '@/services/types'

/**
 * Custom hook for handling game guess submission logic
 *
 * Separates business logic from UI components following SOLID principles
 */
export function useGameGuess(
  validationService: GameValidationService,
  scoringService: ScoringService
) {
  const store = useGameStore()

  const submitGuess = useCallback(
    async (game: Game | null, userInput: string) => {
      const timeTakenMs = Date.now() - (store.timerStartedAt || Date.now())

      try {
        // Validate guess via service
        const validation = await validationService.validateGuess(
          game,
          store.currentScreenshot
        )

        // Calculate score via service
        const scoreEarned = scoringService.calculateScore(
          timeTakenMs,
          validation.isCorrect
        )

        // Pause timer
        store.pauseTimer()

        // Record result
        store.addGuessResult({
          position: store.currentPosition,
          isCorrect: validation.isCorrect,
          correctGame: validation.correctGame,
          userGuess: game?.name || userInput,
          timeTakenMs,
          scoreEarned,
        })

        // Update stats
        if (validation.isCorrect) {
          store.incrementCorrectAnswers()
        }

        store.updateScore(store.totalScore + scoreEarned)

        // Transition to result phase
        store.setGamePhase('result')

        return {
          success: true,
          isCorrect: validation.isCorrect,
          scoreEarned,
        }
      } catch (error) {
        console.error('Failed to submit guess:', error)
        return {
          success: false,
          isCorrect: false,
          scoreEarned: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },
    [validationService, scoringService, store]
  )

  const skipRound = useCallback(() => {
    const timeTakenMs = Date.now() - (store.timerStartedAt || Date.now())

    store.pauseTimer()

    // Use the first mock game as correct answer for skip
    const mockCorrectGame: Game = {
      id: 1,
      name: 'The Witcher 3: Wild Hunt',
      slug: 'witcher-3',
      aliases: ['Witcher 3', 'TW3'],
      releaseYear: 2015,
    }

    store.addGuessResult({
      position: store.currentPosition,
      isCorrect: false,
      correctGame: mockCorrectGame,
      userGuess: null,
      timeTakenMs,
      scoreEarned: 0,
    })

    store.setGamePhase('result')
  }, [store])

  return {
    submitGuess,
    skipRound,
  }
}
