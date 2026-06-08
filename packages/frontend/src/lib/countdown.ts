/**
 * Pure helpers for the per-screenshot round countdown timer.
 *
 * Kept free of React/DOM imports so the timing math can be unit-tested in
 * isolation (see countdown.test.ts) and reused by both the display hook and
 * any future server-side parity checks.
 */

/** Fallback when a tier/screenshot does not carry an explicit limit. */
export const DEFAULT_TIME_LIMIT_SECONDS = 45

/** Below this many seconds remaining the timer is "running out" (yellow). */
export const WARNING_THRESHOLD_SECONDS = 15
/** Below this many seconds remaining the timer is "critical" (red). */
export const CRITICAL_THRESHOLD_SECONDS = 5

export type TimerPhase = 'normal' | 'warning' | 'critical'

/**
 * Milliseconds left on the round, clamped to `[0, limitMs]`.
 *
 * Recomputed from the wall clock (`now - startedAt`) rather than decrementing a
 * counter, so a throttled/backgrounded tab can never desync — when it resumes
 * it reads the true elapsed. Clamping makes it clock-skew safe: a `now` before
 * `startedAt` yields the full limit (never more), and an overshoot yields 0
 * (never negative).
 */
export function computeRemainingMs(
  now: number,
  startedAt: number | null,
  limitMs: number
): number {
  if (limitMs <= 0) return 0
  if (startedAt == null) return limitMs
  const remaining = limitMs - (now - startedAt)
  if (remaining <= 0) return 0
  if (remaining > limitMs) return limitMs
  return remaining
}

/**
 * Whole seconds to display. Uses ceil so the timer reads the full limit at
 * t=0 and only shows 0 once it has genuinely expired (e.g. 0.4s left → "1").
 */
export function remainingSeconds(remainingMs: number): number {
  return Math.ceil(Math.max(0, remainingMs) / 1000)
}

/** Visual urgency band from the whole-seconds remaining. */
export function getTimerPhase(remainingSec: number): TimerPhase {
  if (remainingSec <= CRITICAL_THRESHOLD_SECONDS) return 'critical'
  if (remainingSec <= WARNING_THRESHOLD_SECONDS) return 'warning'
  return 'normal'
}

/** Fraction of time remaining in `[0, 1]` — drives the ring sweep. */
export function remainingFraction(remainingMs: number, limitMs: number): number {
  if (limitMs <= 0) return 0
  const f = remainingMs / limitMs
  if (f < 0) return 0
  if (f > 1) return 1
  return f
}

/** Format as `M:SS` (e.g. "0:45", "0:05"). Deliberately not bare digits so it
 * never collides with numeric score selectors. */
export function formatCountdown(remainingSec: number): string {
  const s = Math.max(0, Math.floor(remainingSec))
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
