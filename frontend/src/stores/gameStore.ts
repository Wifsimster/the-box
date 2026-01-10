import { create } from 'zustand'
import { persist, devtools } from 'zustand/middleware'
import type {
  GamePhase,
  GuessResult,
  PowerUpType,
  PowerUp,
  Game,
  TierScreenshot
} from '@/types'

interface GameState {
  // Session data
  sessionId: string | null
  challengeId: number | null
  challengeDate: string | null

  // Current tier state
  currentTier: number
  currentTierName: string
  totalTiers: number

  // Current round state
  currentPosition: number
  totalScreenshots: number
  currentScreenshot: TierScreenshot | null

  // Timer state
  timeRemaining: number
  defaultTimeLimit: number
  timerRunning: boolean
  timerStartedAt: number | null

  // Score tracking
  totalScore: number
  tierScore: number
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
  setSessionId: (id: string) => void
  setChallengeId: (id: number, date: string) => void
  setTier: (tier: number, name: string, totalTiers: number) => void
  setScreenshot: (screenshot: TierScreenshot, position: number, total: number) => void
  setTimeLimit: (seconds: number) => void

  startTimer: () => void
  pauseTimer: () => void
  decrementTimer: () => void

  setGamePhase: (phase: GamePhase) => void
  setLoading: (loading: boolean) => void

  addGuessResult: (result: GuessResult) => void
  updateScore: (tierScore: number, totalScore: number) => void
  incrementCorrectAnswers: () => void

  addPowerUp: (powerUp: PowerUp) => void
  activatePowerUp: (type: PowerUpType) => void
  clearActivePowerUp: () => void
  usePowerUp: (type: PowerUpType) => void

  updateLiveLeaderboard: (entries: { username: string; score: number }[]) => void

  nextRound: () => void
  nextTier: () => void
  resetGame: () => void
  resetTier: () => void
}

const initialState = {
  sessionId: null,
  challengeId: null,
  challengeDate: null,
  currentTier: 1,
  currentTierName: 'PALIER 1',
  totalTiers: 1,
  currentPosition: 1,
  totalScreenshots: 18,
  currentScreenshot: null,
  timeRemaining: 30,
  defaultTimeLimit: 30,
  timerRunning: false,
  timerStartedAt: null,
  totalScore: 0,
  tierScore: 0,
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

        setSessionId: (id) => set({ sessionId: id }),

        setChallengeId: (id, date) => set({
          challengeId: id,
          challengeDate: date
        }),

        setTier: (tier, name, totalTiers) => set({
          currentTier: tier,
          currentTierName: name,
          totalTiers,
          tierScore: 0,
          correctAnswers: 0,
          guessResults: [],
        }),

        setScreenshot: (screenshot, position, total) => set({
          currentScreenshot: screenshot,
          currentPosition: position,
          totalScreenshots: total,
        }),

        setTimeLimit: (seconds) => {
          const { activePowerUp } = get()
          const actualTime = activePowerUp === 'x2_timer' ? seconds * 2 : seconds
          set({
            defaultTimeLimit: seconds,
            timeRemaining: actualTime
          })
        },

        startTimer: () => set({
          timerRunning: true,
          timerStartedAt: Date.now()
        }),

        pauseTimer: () => set({ timerRunning: false }),

        decrementTimer: () => {
          const { timeRemaining } = get()
          if (timeRemaining > 0) {
            set({ timeRemaining: timeRemaining - 1 })
          }
        },

        setGamePhase: (phase) => set({ gamePhase: phase }),

        setLoading: (loading) => set({ isLoading: loading }),

        addGuessResult: (result) => set((state) => ({
          guessResults: [...state.guessResults, result],
          lastResult: result,
        })),

        updateScore: (tierScore, totalScore) => set({
          tierScore,
          totalScore
        }),

        incrementCorrectAnswers: () => set((state) => ({
          correctAnswers: state.correctAnswers + 1,
        })),

        addPowerUp: (powerUp) => set((state) => ({
          availablePowerUps: [...state.availablePowerUps, powerUp],
        })),

        activatePowerUp: (type) => {
          const { defaultTimeLimit, availablePowerUps } = get()
          const powerUp = availablePowerUps.find(p => p.powerUpType === type && !p.isUsed)
          if (powerUp) {
            set({ activePowerUp: type })
            // If it's a timer power-up, double the time
            if (type === 'x2_timer') {
              set({ timeRemaining: defaultTimeLimit * 2 })
            }
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
          const { currentPosition, totalScreenshots } = get()
          if (currentPosition < totalScreenshots) {
            set({
              currentPosition: currentPosition + 1,
              lastResult: null,
              activePowerUp: null,
            })
          }
        },

        nextTier: () => {
          const { currentTier, totalTiers } = get()
          if (currentTier < totalTiers) {
            set({
              currentTier: currentTier + 1,
              currentTierName: `PALIER ${currentTier + 1}`,
              currentPosition: 1,
              tierScore: 0,
              correctAnswers: 0,
              guessResults: [],
              lastResult: null,
              activePowerUp: null,
              gamePhase: 'tier_intro',
            })
          } else {
            set({ gamePhase: 'challenge_complete' })
          }
        },

        resetGame: () => set(initialState),

        resetTier: () => set({
          currentPosition: 1,
          tierScore: 0,
          correctAnswers: 0,
          guessResults: [],
          lastResult: null,
          activePowerUp: null,
          timerRunning: false,
          timerStartedAt: null,
        }),
      }),
      {
        name: 'game-session',
        partialize: (state) => ({
          sessionId: state.sessionId,
          challengeId: state.challengeId,
          challengeDate: state.challengeDate,
          currentTier: state.currentTier,
          totalScore: state.totalScore,
        }),
      }
    ),
    { name: 'GameStore' }
  )
)
