import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '@/stores/gameStore'
import { toast } from '@/lib/toast'
import {
  computeRemainingMs,
  remainingSeconds as toSeconds,
  remainingFraction,
  getTimerPhase,
  DEFAULT_TIME_LIMIT_SECONDS,
  type TimerPhase,
} from '@/lib/countdown'

// Recompute 4×/s: smooth enough for the ring, cheap enough to ignore. The
// value is derived from the wall clock on every tick, so the exact cadence
// only affects visual smoothness, never correctness.
const TICK_MS = 250

export interface CountdownState {
  /** Whole seconds remaining (ceil). */
  seconds: number
  /** Configured limit for this screenshot, in seconds. */
  limitSeconds: number
  /** Visual urgency band. */
  phase: TimerPhase
  /** True once the round has run out of time (only while the timer is active). */
  isExpired: boolean
  /** 1 → 0 fraction remaining, for the ring sweep. */
  fraction: number
  /**
   * Whether the timer is live: we're in the playing phase and the loaded
   * screenshot matches the current position (i.e. not mid-navigation/loading).
   */
  isActive: boolean
}

/**
 * Derives the remaining time for the current round from the store's
 * `roundStartedAt` and the screenshot's `timeLimitSeconds`. Pure projection —
 * holds no countdown of its own — so it stays correct across round changes,
 * navigation and session resume (all of which re-stamp `roundStartedAt`).
 */
export function useCountdownTimer(): CountdownState {
  const roundStartedAt = useGameStore((s) => s.roundStartedAt)
  const gamePhase = useGameStore((s) => s.gamePhase)
  const currentPosition = useGameStore((s) => s.currentPosition)
  const screenshotPosition = useGameStore((s) => s.currentScreenshotData?.position)
  const limitSeconds = useGameStore(
    (s) => s.currentScreenshotData?.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS
  )

  // Active only when the loaded screenshot is the one we're playing. During the
  // brief navigation/fetch gap `screenshotPosition` lags `currentPosition`, so
  // the timer pauses instead of flashing 0:00 against the previous round.
  const isActive =
    gamePhase === 'playing' &&
    roundStartedAt != null &&
    screenshotPosition === currentPosition

  const limitMs = limitSeconds * 1000

  // We track "now" in state (sampled only inside the interval callback, never
  // during render) and derive the remaining time from it. Reading the clock in
  // a callback rather than in render keeps the component pure; deriving the
  // remainder means a round change recomputes for free — because the fresh
  // `roundStartedAt` is within one tick of the last sampled `now`, the value
  // lands at ~full immediately with no 0:00 flash.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [roundStartedAt, limitMs, isActive])

  const remainingMs = computeRemainingMs(now, roundStartedAt, limitMs)
  const seconds = toSeconds(remainingMs)

  return {
    seconds,
    limitSeconds,
    phase: getTimerPhase(seconds),
    isExpired: isActive && remainingMs <= 0,
    fraction: remainingFraction(remainingMs, limitMs),
    isActive,
  }
}

/**
 * Display state + the timeout side-effect for the active round. When the timer
 * expires it locks the current screenshot as a permanent miss and advances (or
 * ends the game if nothing playable remains). Latched per round so it fires at
 * most once, and gated so it can't fire on a position that was just solved.
 */
export function useRoundTimer(): CountdownState {
  const state = useCountdownTimer()
  const { t } = useTranslation()
  const roundStartedAt = useGameStore((s) => s.roundStartedAt)

  // Remember which round we've already timed out, so the expiry effect — which
  // keeps re-running while `isExpired` stays true during the fetch gap — only
  // acts once.
  const firedForRound = useRef<number | null>(null)

  useEffect(() => {
    if (!state.isExpired || roundStartedAt == null) return
    if (firedForRound.current === roundStartedAt) return

    const store = useGameStore.getState()
    const { currentPosition, positionStates } = store
    // Only time out a screenshot the player is actively guessing. Guards the
    // race where an in-flight correct guess has already marked it 'correct'.
    if (positionStates[currentPosition]?.status !== 'in_progress') return

    firedForRound.current = roundStartedAt
    toast.error(t('game.timeUp'))

    const next = store.timeOutCurrentPosition()
    if (next === null) {
      // No playable position left — reveal results.
      void store.endGameAction().catch((err) => {
        console.error('Failed to end game after timeout:', err)
      })
    }
  }, [state.isExpired, roundStartedAt, t])

  return state
}
