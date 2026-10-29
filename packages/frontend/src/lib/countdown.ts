export const DEFAULT_TIME_LIMIT_SECONDS = 45

export const WARNING_THRESHOLD_SECONDS = 15
export const CRITICAL_THRESHOLD_SECONDS = 5

export type TimerPhase = 'normal' | 'warning' | 'critical'

export function computeRemainingMs(
  now: number,
  startedAt: number | null,
  limitMs: number,
  alreadySpentMs = 0
): number {
  if (limitMs <= 0) return 0
  const budget = limitMs - Math.max(0, alreadySpentMs)
  if (budget <= 0) return 0
  if (startedAt == null) return budget
  const remaining = budget - (now - startedAt)
  if (remaining <= 0) return 0
  if (remaining > budget) return budget
  return remaining
}

export function remainingSeconds(remainingMs: number): number {
  return Math.ceil(Math.max(0, remainingMs) / 1000)
}

export function getTimerPhase(remainingSec: number): TimerPhase {
  if (remainingSec <= CRITICAL_THRESHOLD_SECONDS) return 'critical'
  if (remainingSec <= WARNING_THRESHOLD_SECONDS) return 'warning'
  return 'normal'
}

export function remainingFraction(remainingMs: number, limitMs: number): number {
  if (limitMs <= 0) return 0
  const f = remainingMs / limitMs
  if (f < 0) return 0
  if (f > 1) return 1
  return f
}

export function formatCountdown(remainingSec: number): string {
  const s = Math.max(0, Math.floor(remainingSec))
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
