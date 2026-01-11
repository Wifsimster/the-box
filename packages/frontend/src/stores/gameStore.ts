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

interface GameState {
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

  nextRound: () => void
  resetGame: () => void
}

const initialState = {
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
          set({
            initialScore: config.initialScore,
            decayRate: config.decayRate,
            sessionStartedAt: startedAtTimestamp,
            currentScore: config.initialScore,
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

        resetGame: () => set(initialState),
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
        }),
      }
    ),
    { name: 'GameStore' }
  )
)
