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

const TICK_MS = 250

export interface CountdownState {
  seconds: number
  limitSeconds: number
  phase: TimerPhase
  isExpired: boolean
  fraction: number
  isActive: boolean
}

export function useCountdownTimer(): CountdownState {
  const roundStartedAt = useGameStore((s) => s.roundStartedAt)
  const gamePhase = useGameStore((s) => s.gamePhase)
  const currentPosition = useGameStore((s) => s.currentPosition)
  const screenshotPosition = useGameStore((s) => s.currentScreenshotData?.position)
  const limitSeconds = useGameStore(
    (s) => s.currentScreenshotData?.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS
  )
  const timeSpentMs = useGameStore(
    (s) => s.positionStates[s.currentPosition]?.timeSpentMs ?? 0
  )

  const isActive =
    gamePhase === 'playing' &&
    roundStartedAt != null &&
    screenshotPosition === currentPosition

  const limitMs = limitSeconds * 1000

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [roundStartedAt, limitMs, isActive])

  const remainingMs = computeRemainingMs(now, roundStartedAt, limitMs, timeSpentMs)
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

export function useRoundTimer(): CountdownState {
  const state = useCountdownTimer()
  const { t } = useTranslation()
  const currentPosition = useGameStore((s) => s.currentPosition)

  const firedForPosition = useRef<number | null>(null)

  useEffect(() => {
    if (!state.isExpired) return
    if (firedForPosition.current === currentPosition) return

    const store = useGameStore.getState()
    const { currentPosition: pos, positionStates } = store
    if (positionStates[pos]?.status !== 'in_progress') return

    firedForPosition.current = pos
    toast.error(t('game.timeUp'))

    const next = store.timeOutCurrentPosition()
    if (next === null) {
      void store.endGameAction().catch((err) => {
        console.error('Failed to end game after timeout:', err)
      })
    }
  }, [state.isExpired, currentPosition, t])

  return state
}
