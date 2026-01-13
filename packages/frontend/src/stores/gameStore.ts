import { create } from 'zustand'
import { persist, devtools } from 'zustand/middleware'
import type {
  GamePhase,
  GuessResult,
  PowerUpType,
  PowerUp,
  Game,
  TierScreenshot,
  ScreenshotResponse,
  PositionStatus,
  PositionState
} from '@/types'
import { gameApi } from '@/lib/api/game'

interface GameState {
  // Hydration tracking
  _hasHydrated: boolean

  // Session data
  sessionId: string | null
  tierSessionId: string | null
  challengeId: number | null
  challengeDate: string | null

  // Current round state
  currentPosition: number
  totalScreenshots: number
  currentScreenshot: TierScreenshot | null
  currentScreenshotData: ScreenshotResponse | null

  // Position tracking for navigation
  positionStates: Record<number, PositionState>

  screenshotsFound: number

  // Round timing (for per-screenshot time tracking)
  roundStartedAt: number | null

  // Score tracking
  totalScore: number
  correctAnswers: number
  guessResults: GuessResult[]

  // Countdown scoring
  initialScore: number | null
  decayRate: number | null
  sessionStartedAt: number | null
  scoreRunning: boolean

  // Power-ups
  availablePowerUps: PowerUp[]
  activePowerUp: PowerUpType | null

  // UI state
  gamePhase: GamePhase
  isLoading: boolean
  lastResult: GuessResult | null

  // Live leaderboard
  liveLeaderboard: { username: string; score: number }[]

  // Actions
  setSessionId: (id: string, tierSessionId: string) => void
  setChallengeId: (id: number, date: string) => void
  setScreenshot: (screenshot: TierScreenshot, position: number, total: number) => void
  setScreenshotData: (data: ScreenshotResponse) => void

  setScreenshotsFound: (count: number) => void
  setRoundStartedAt: (timestamp: number) => void

  setGamePhase: (phase: GamePhase) => void
  setLoading: (loading: boolean) => void

  addGuessResult: (result: GuessResult) => void
  updateScore: (totalScore: number) => void
  incrementCorrectAnswers: () => void

  addPowerUp: (powerUp: PowerUp) => void
  activatePowerUp: (type: PowerUpType) => void
  clearActivePowerUp: () => void
  usePowerUp: (type: PowerUpType) => void

  updateLiveLeaderboard: (entries: { username: string; score: number }[]) => void

  // Position navigation actions
  initializePositionStates: (total: number) => void
  updatePositionState: (position: number, updates: Partial<PositionState>) => void
  skipToNextPosition: () => number | null
  navigateToPosition: (position: number) => void
  findNextUnfinished: (fromPosition: number) => number | null
  canNavigateTo: (position: number) => boolean

  // Session restore action
  restoreSessionState: (data: {
    challengeId: number
    correctPositions: number[]
    currentPosition: number
    totalScreenshots: number
    screenshotsFound: number
    totalScore: number
  }) => void

  nextRound: () => void
  resetGame: () => void
  setHasHydrated: (hydrated: boolean) => void

  // End game actions
  hasVisitedAllPositions: () => boolean
  endGameAction: () => Promise<void>
}

const initialState = {
  _hasHydrated: false,
  sessionId: null,
  tierSessionId: null,
  challengeId: null,
  challengeDate: null,
  currentPosition: 1,
  totalScreenshots: 10,
  currentScreenshot: null,
  currentScreenshotData: null,
  // Position tracking for navigation
  positionStates: {} as Record<number, PositionState>,
  screenshotsFound: 0,
  // Round timing
  roundStartedAt: null,
  // Score tracking
  totalScore: 0,
  correctAnswers: 0,
  guessResults: [],
  // Countdown scoring
  initialScore: null,
  decayRate: null,
  sessionStartedAt: null,
  scoreRunning: false,
  availablePowerUps: [],
  activePowerUp: null,
  gamePhase: 'idle' as GamePhase,
  isLoading: false,
  lastResult: null,
  liveLeaderboard: [],
}

export const useGameStore = create<GameState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        setSessionId: (id, tierSessionId) => set({ sessionId: id, tierSessionId }),

        setChallengeId: (id, date) => set({
          challengeId: id,
          challengeDate: date
        }),

        setScreenshot: (screenshot, position, total) => set({
          currentScreenshot: screenshot,
          currentPosition: position,
          totalScreenshots: total,
        }),

        setScreenshotData: (data) => set({
          currentScreenshotData: data,
          currentPosition: data.position,
          roundStartedAt: Date.now(),
        }),

        setScreenshotsFound: (count) => set({ screenshotsFound: count }),

        setRoundStartedAt: (timestamp) => set({ roundStartedAt: timestamp }),

        setGamePhase: (phase) => set({ gamePhase: phase }),

        setLoading: (loading) => set({ isLoading: loading }),

        addGuessResult: (result) => set((state) => ({
          guessResults: [...state.guessResults, result],
          lastResult: result,
        })),

        updateScore: (totalScore) => set({ totalScore }),

        incrementCorrectAnswers: () => set((state) => ({
          correctAnswers: state.correctAnswers + 1,
        })),

        addPowerUp: (powerUp) => set((state) => ({
          availablePowerUps: [...state.availablePowerUps, powerUp],
        })),

        activatePowerUp: (type) => {
          const { availablePowerUps } = get()
          const powerUp = availablePowerUps.find(p => p.powerUpType === type && !p.isUsed)
          if (powerUp) {
            set({ activePowerUp: type })
            // Note: x2_timer power-up no longer affects time - could add score multiplier instead
          }
        },

        clearActivePowerUp: () => set({ activePowerUp: null }),

        usePowerUp: (type) => set((state) => ({
          availablePowerUps: state.availablePowerUps.map(p =>
            p.powerUpType === type && !p.isUsed
              ? { ...p, isUsed: true, usedAtRound: state.currentPosition }
              : p
          ),
          activePowerUp: null,
        })),

        updateLiveLeaderboard: (entries) => set({ liveLeaderboard: entries }),

        // Session restore action - restores full game state from backend data
        // Merges persisted local state with authoritative backend data
        restoreSessionState: (data) => {
          const { challengeId, correctPositions, currentPosition: backendPosition, totalScreenshots, screenshotsFound, totalScore } = data

          // Get existing persisted state (from localStorage hydration)
          const existingStates = get().positionStates
          const persistedPosition = get().currentPosition
          const persistedChallengeId = get().challengeId

          // Check if localStorage data is from the same challenge
          const isSameChallenge = persistedChallengeId === challengeId

          // Build position states by merging backend + persisted data
          const states: Record<number, PositionState> = {}
          for (let i = 1; i <= totalScreenshots; i++) {
            const isCorrect = correctPositions.includes(i)
            const existingState = existingStates[i]

            // Determine status with priority:
            // 1. Backend says correct → always correct (authoritative)
            // 2. Persisted state exists, same challenge, and not stale → use it (preserves skipped)
            // 3. Calculate from backend currentPosition
            let status: PositionStatus
            if (isCorrect) {
              status = 'correct'
            } else if (isSameChallenge && existingState && existingState.status !== 'correct') {
              // Keep persisted status (skipped, in_progress, not_visited) only if same challenge
              status = existingState.status
            } else if (i === backendPosition) {
              status = 'in_progress'
            } else if (i < backendPosition) {
              // Positions before current that aren't correct were skipped
              status = 'skipped'
            } else {
              status = 'not_visited'
            }
            states[i] = { position: i, status, isCorrect }
          }

          // Use persisted position only if same challenge and valid, otherwise use backend position
          const restoredPosition = isSameChallenge && persistedPosition > 0 && persistedPosition <= totalScreenshots
            ? persistedPosition
            : backendPosition

          // Ensure restored position is marked as in_progress
          if (states[restoredPosition] && states[restoredPosition].status !== 'correct') {
            states[restoredPosition] = { ...states[restoredPosition], status: 'in_progress' }
          }

          set({
            challengeId, // Update challenge ID to current
            positionStates: states,
            currentPosition: restoredPosition,
            totalScreenshots,
            screenshotsFound,
            correctAnswers: screenshotsFound,
            totalScore,
          })
        },

        // Position navigation actions
        initializePositionStates: (total) => {
          const states: Record<number, PositionState> = {}
          for (let i = 1; i <= total; i++) {
            states[i] = {
              position: i,
              status: i === 1 ? 'in_progress' : 'not_visited',
              isCorrect: false,
            }
          }
          set({ positionStates: states, currentPosition: 1 })
        },

        updatePositionState: (position, updates) => {
          set((state) => ({
            positionStates: {
              ...state.positionStates,
              [position]: {
                ...state.positionStates[position],
                ...updates,
              },
            },
          }))
        },

        findNextUnfinished: (fromPosition) => {
          const { positionStates, totalScreenshots } = get()
          // First check forward positions (new, skipped, or correct) - return immediately next position
          for (let i = fromPosition + 1; i <= totalScreenshots; i++) {
            const state = positionStates[i]
            if (!state || state.status === 'not_visited' || state.status === 'skipped' || state.status === 'correct' || state.status === 'in_progress') {
              return i
            }
          }
          // Only wrap around to skipped/correct positions if we're NOT on the last position
          // This prevents auto-navigation when on the final screenshot
          if (fromPosition < totalScreenshots) {
            // Then check skipped or correct positions from beginning (wrap around)
            for (let i = 1; i < fromPosition; i++) {
              const state = positionStates[i]
              if (state?.status === 'skipped' || state?.status === 'correct') {
                return i
              }
            }
          }
          return null
        },

        canNavigateTo: (position) => {
          const { positionStates, currentPosition } = get()
          const state = positionStates[position]
          if (!state) return false
          // Allow navigation to any position except the current one
          if (position === currentPosition) return false
          return state.status === 'skipped' ||
            state.status === 'in_progress' ||
            state.status === 'not_visited' ||
            state.status === 'correct'
        },

        skipToNextPosition: () => {
          const { currentPosition, positionStates } = get()
          const currentState = positionStates[currentPosition]

          // Mark current as skipped (only if not already correct)
          if (currentState && currentState.status === 'in_progress') {
            set((state) => ({
              positionStates: {
                ...state.positionStates,
                [currentPosition]: {
                  ...state.positionStates[currentPosition],
                  status: 'skipped',
                },
              },
            }))
          }

          // Find next position (including correct ones)
          const nextPos = get().findNextUnfinished(currentPosition)
          if (nextPos) {
            // Navigate to next position
            const nextState = get().positionStates[nextPos]
            set({
              currentPosition: nextPos,
              lastResult: null,
              activePowerUp: null,
            })
            // Mark as in_progress if was not_visited
            if (!nextState || nextState.status === 'not_visited') {
              set((state) => ({
                positionStates: {
                  ...state.positionStates,
                  [nextPos]: {
                    ...state.positionStates[nextPos],
                    position: nextPos,
                    status: 'in_progress',
                    isCorrect: false,
                  },
                },
              }))
            } else if (nextState.status === 'skipped') {
              // Resuming a skipped position, mark as in_progress
              set((state) => ({
                positionStates: {
                  ...state.positionStates,
                  [nextPos]: {
                    ...state.positionStates[nextPos],
                    status: 'in_progress',
                  },
                },
              }))
            }
            // If status is 'correct', keep it as 'correct' (don't modify)
            return nextPos
          }

          // No more positions - challenge complete
          set({ gamePhase: 'challenge_complete' })
          return null
        },

        navigateToPosition: (position) => {
          const { positionStates } = get()
          const state = positionStates[position]

          if (!state) return

          // Update current position
          set({
            currentPosition: position,
            lastResult: null,
            activePowerUp: null,
          })

          // Mark as in_progress only if not already correct
          // Keep correct positions as correct (don't change to in_progress)
          if (state.status === 'not_visited' || state.status === 'skipped') {
            set((prev) => ({
              positionStates: {
                ...prev.positionStates,
                [position]: {
                  ...prev.positionStates[position],
                  status: 'in_progress',
                },
              },
            }))
          }
          // If status is 'correct', keep it as 'correct' (don't modify)
        },

        nextRound: () => {
          const { currentPosition, totalScreenshots } = get()
          if (currentPosition < totalScreenshots) {
            set({
              currentPosition: currentPosition + 1,
              lastResult: null,
              activePowerUp: null,
            })
          } else {
            // Challenge complete
            set({ gamePhase: 'challenge_complete' })
          }
        },

        resetGame: () => set({ ...initialState, _hasHydrated: true }),

        setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),

        // End game actions
        hasVisitedAllPositions: () => {
          const { positionStates, totalScreenshots } = get()
          for (let i = 1; i <= totalScreenshots; i++) {
            const state = positionStates[i]
            if (!state || state.status === 'not_visited') {
              return false
            }
          }
          return true
        },

        endGameAction: async () => {
          const { sessionId, updateScore, setScreenshotsFound, setGamePhase } = get()
          if (!sessionId) return

          try {
            const result = await gameApi.endGame(sessionId)
            updateScore(result.totalScore)
            setScreenshotsFound(result.screenshotsFound)
            setGamePhase('challenge_complete')
          } catch (err) {
            console.error('Failed to end game:', err)
            throw err
          }
        },
      }),
      {
        name: 'game-session',
        partialize: (state) => ({
          sessionId: state.sessionId,
          tierSessionId: state.tierSessionId,
          challengeId: state.challengeId,
          challengeDate: state.challengeDate,
          totalScore: state.totalScore,
          // Persist position states for navigation on refresh
          positionStates: state.positionStates,
          currentPosition: state.currentPosition,
          screenshotsFound: state.screenshotsFound,
          // Persist guess results for results page display
          guessResults: state.guessResults,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true)
        },
      }
    ),
    { name: 'GameStore' }
  )
)
