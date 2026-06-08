import { m } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { formatCountdown, type TimerPhase } from '@/lib/countdown'
import type { CountdownState } from '@/hooks/useCountdownTimer'

const RADIUS = 20
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const PHASE_STYLES: Record<TimerPhase, { stroke: string; text: string; glow?: string }> = {
  normal: { stroke: 'stroke-neon-purple', text: 'text-neon-purple' },
  warning: { stroke: 'stroke-warning', text: 'text-warning', glow: 'var(--glow-warning)' },
  critical: { stroke: 'stroke-error', text: 'text-error', glow: 'var(--glow-error)' },
}

/**
 * Circular per-screenshot countdown. Anchored top-left in a shell that mirrors
 * the score panel so the two top corners read as a matched pair, and kept top-
 * anchored so the mobile keyboard never covers it.
 *
 * Display-only: all timing lives in `useCountdownTimer`. Rendered without an
 * opacity entrance so visibility never depends on animation/clock state — which
 * also keeps it deterministic under Playwright's fake clock.
 */
export function CountdownTimer({ state }: { state: CountdownState }) {
  const { t } = useTranslation()
  const prefersReducedMotion = useReducedMotionSafe()

  // Only present while a round is actually being played.
  if (!state.isActive) return null

  const { seconds, phase, fraction } = state
  const styles = PHASE_STYLES[phase]
  const isCritical = phase === 'critical'

  return (
    <div
      role="timer"
      aria-label={t('game.timer.label', { seconds })}
      data-state={phase}
      className="relative flex size-12 items-center justify-center rounded-full border border-white/10 bg-black/60 shadow-2xl backdrop-blur-md sm:size-14"
      style={styles.glow && !prefersReducedMotion ? { boxShadow: styles.glow } : undefined}
    >
      <svg
        className="absolute inset-0 size-full -rotate-90"
        viewBox="0 0 48 48"
        aria-hidden="true"
      >
        <circle cx="24" cy="24" r={RADIUS} fill="none" strokeWidth="3" className="stroke-white/10" />
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className={cn(styles.stroke, !prefersReducedMotion && 'transition-[stroke-dashoffset] duration-200 ease-linear')}
          style={{
            strokeDasharray: CIRCUMFERENCE,
            strokeDashoffset: CIRCUMFERENCE * (1 - fraction),
          }}
        />
      </svg>
      <m.span
        animate={isCritical && !prefersReducedMotion ? { scale: [1, 1.15, 1] } : { scale: 1 }}
        transition={
          isCritical && !prefersReducedMotion
            ? { duration: 1, repeat: Infinity }
            : { duration: 0.2 }
        }
        className={cn('relative text-sm font-bold tabular-nums sm:text-base', styles.text)}
      >
        {formatCountdown(seconds)}
      </m.span>
    </div>
  )
}
