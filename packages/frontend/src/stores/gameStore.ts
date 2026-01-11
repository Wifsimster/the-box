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
  ScoringConfig
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

  // Countdown scoring state
  currentScore: number
  initialScore: number
  decayRate: number
  sessionStartedAt: number | null
  scoreRunning: boolean

  // Tries tracking
  triesRemaining: number
  maxTriesPerScreenshot: number
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
  setTriesRemaining: (tries: number) => void
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
  // Countdown scoring state
  currentScore: 1000,
  initialScore: 1000,
  decayRate: 2,
  sessionStartedAt: null,
  scoreRunning: false,
  // Tries tracking
  triesRemaining: 3,
  maxTriesPerScreenshot: 3,
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
            maxTriesPerScreenshot: config.maxTriesPerScreenshot,
            triesRemaining: config.maxTriesPerScreenshot,
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

        setTriesRemaining: (tries) => set({ triesRemaining: tries }),

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

        nextRound: () => {
          const { currentPosition, totalScreenshots, maxTriesPerScreenshot } = get()
          if (currentPosition < totalScreenshots) {
            set({
              currentPosition: currentPosition + 1,
              lastResult: null,
              activePowerUp: null,
              triesRemaining: maxTriesPerScreenshot,
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
          maxTriesPerScreenshot: state.maxTriesPerScreenshot,
        }),
      }
    ),
    { name: 'GameStore' }
  )
)
