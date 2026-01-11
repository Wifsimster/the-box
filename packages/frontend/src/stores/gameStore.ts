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
  ScoringConfig,
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

  // Countdown scoring state
  currentScore: number
  initialScore: number
  decayRate: number
  sessionStartedAt: number | null
  scoreRunning: boolean

  screenshotsFound: number

  // Round timing (for per-screenshot time tracking)
  roundStartedAt: number | null

  // Score tracking (legacy - totalScore now represents locked-in score)
  totalScore: number
  correctAnswers: number
  guessResults: GuessResult[]

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

  // Countdown scoring actions
  setSessionScoring: (config: ScoringConfig, sessionStartedAt: string) => void
  startScoreCountdown: () => void
  stopScoreCountdown: () => void
  decrementScore: () => void
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
    sessionStartedAt: string
    scoringConfig: ScoringConfig
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
  // Countdown scoring state
  currentScore: 1000,
  initialScore: 1000,
  decayRate: 2,
  sessionStartedAt: null,
  scoreRunning: false,
  screenshotsFound: 0,
  // Round timing
  roundStartedAt: null,
  // Score tracking
  totalScore: 0,
  correctAnswers: 0,
  guessResults: [],
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

        // Countdown scoring actions
        setSessionScoring: (config, sessionStartedAt) => {
          const startedAtTimestamp = new Date(sessionStartedAt).getTime()
          // Use defensive defaults to ensure valid score values
          const initialScoreValue = config.initialScore || 1000
          const decayRateValue = config.decayRate || 2
          set({
            initialScore: initialScoreValue,
            decayRate: decayRateValue,
            sessionStartedAt: startedAtTimestamp,
            currentScore: initialScoreValue,
            roundStartedAt: Date.now(),
          })
        },

        startScoreCountdown: () => set({ scoreRunning: true }),

        stopScoreCountdown: () => set({ scoreRunning: false }),

        decrementScore: () => {
          const { currentScore, decayRate, scoreRunning } = get()
          if (scoreRunning && currentScore > 0) {
            set({ currentScore: Math.max(0, currentScore - decayRate) })
          }
        },

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
          const { challengeId, correctPositions, currentPosition: backendPosition, totalScreenshots, screenshotsFound, totalScore, sessionStartedAt, scoringConfig } = data

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

          // Calculate current countdown score based on elapsed time
          const startedAtTimestamp = new Date(sessionStartedAt).getTime()
          const elapsedMs = Date.now() - startedAtTimestamp
          const elapsedSeconds = Math.floor(elapsedMs / 1000)
          const currentScore = Math.max(0, scoringConfig.initialScore - (elapsedSeconds * scoringConfig.decayRate))

          set({
            challengeId, // Update challenge ID to current
            positionStates: states,
            currentPosition: restoredPosition,
            totalScreenshots,
            screenshotsFound,
            correctAnswers: screenshotsFound,
            totalScore,
            sessionStartedAt: startedAtTimestamp,
            initialScore: scoringConfig.initialScore,
            decayRate: scoringConfig.decayRate,
            currentScore,
            scoreRunning: true,
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
          // First check forward positions (new or skipped)
          for (let i = fromPosition + 1; i <= totalScreenshots; i++) {
            const state = positionStates[i]
            if (!state || state.status === 'not_visited' || state.status === 'skipped') {
              return i
            }
          }
          // Then check skipped positions from beginning
          for (let i = 1; i < fromPosition; i++) {
            const state = positionStates[i]
            if (state?.status === 'skipped') {
              return i
            }
          }
          return null
        },

        canNavigateTo: (position) => {
          const { positionStates } = get()
          const state = positionStates[position]
          if (!state) return false
          return state.status === 'skipped' ||
            state.status === 'in_progress' ||
            state.status === 'not_visited'
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

          // Find next unfinished position
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
            } else {
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
            return nextPos
          }

          // No more positions - challenge complete
          set({ gamePhase: 'challenge_complete', scoreRunning: false })
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

          // Mark as in_progress
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
            set({ gamePhase: 'challenge_complete', scoreRunning: false })
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
          const { sessionId, stopScoreCountdown, updateScore, setScreenshotsFound, setGamePhase } = get()
          if (!sessionId) return

          try {
            const result = await gameApi.endGame(sessionId)
            updateScore(result.totalScore)
            setScreenshotsFound(result.screenshotsFound)
            stopScoreCountdown()
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
          sessionStartedAt: state.sessionStartedAt,
          initialScore: state.initialScore,
          decayRate: state.decayRate,
          // Persist position states for navigation on refresh
          positionStates: state.positionStates,
          currentPosition: state.currentPosition,
          screenshotsFound: state.screenshotsFound,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true)
        },
      }
    ),
    { name: 'GameStore' }
  )
)
