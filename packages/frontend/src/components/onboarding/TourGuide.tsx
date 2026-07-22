import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { markTourCompleted } from './tour-storage'

/**
 * data-tour attribute values that the tour walks through.
 * Each step finds its target with `document.querySelector(`[data-tour="${target}"]`)`.
 */
export type TourTarget =
  | 'play-cta'
  | 'geo-cta'
  | 'leaderboard-link'
  | 'daily-reward-badge'
  | 'profile-menu'

type Placement = 'top' | 'bottom' | 'left' | 'right'

interface TourStep {
  target: TourTarget
  /** i18n keys for title + body. */
  titleKey: string
  bodyKey: string
  /** Preferred placement of the tooltip; falls back to `bottom` if it overflows. */
  placement?: Placement
}

const STEPS: TourStep[] = [
  {
    target: 'play-cta',
    titleKey: 'tour.steps.play.title',
    bodyKey: 'tour.steps.play.body',
    placement: 'bottom',
  },
  {
    target: 'geo-cta',
    titleKey: 'tour.steps.geo.title',
    bodyKey: 'tour.steps.geo.body',
    placement: 'bottom',
  },
  {
    target: 'leaderboard-link',
    titleKey: 'tour.steps.leaderboard.title',
    bodyKey: 'tour.steps.leaderboard.body',
    placement: 'bottom',
  },
  {
    target: 'daily-reward-badge',
    titleKey: 'tour.steps.dailyReward.title',
    bodyKey: 'tour.steps.dailyReward.body',
    placement: 'bottom',
  },
  {
    target: 'profile-menu',
    titleKey: 'tour.steps.profile.title',
    bodyKey: 'tour.steps.profile.body',
    placement: 'bottom',
  },
]

const PADDING = 8
const TOOLTIP_GAP = 12
const TOOLTIP_WIDTH = 320

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface TooltipPosition {
  top: number
  left: number
  placement: Placement
}

interface TourGuideProps {
  /** When true, force the tour to run regardless of `tour-storage`. */
  open: boolean
  /** Called when the tour completes or is skipped. */
  onClose: () => void
}

function getTargetRect(target: TourTarget): Rect | null {
  if (typeof document === 'undefined') return null
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

function computeTooltipPosition(rect: Rect, preferred: Placement): TooltipPosition {
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight
  // Estimate tooltip height — actual size measured after render is hard
  // to thread through React without two passes, so we clamp against a
  // conservative 220px floor.
  const estHeight = 220

  const candidates: Placement[] = [preferred, 'bottom', 'top', 'right', 'left']
  for (const place of candidates) {
    let top = 0
    let left = 0
    if (place === 'bottom') {
      top = rect.top + rect.height + TOOLTIP_GAP
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
    } else if (place === 'top') {
      top = rect.top - estHeight - TOOLTIP_GAP
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
    } else if (place === 'right') {
      top = rect.top + rect.height / 2 - estHeight / 2
      left = rect.left + rect.width + TOOLTIP_GAP
    } else {
      top = rect.top + rect.height / 2 - estHeight / 2
      left = rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP
    }

    const fits =
      top >= 8 &&
      left >= 8 &&
      top + estHeight <= viewportH - 8 &&
      left + TOOLTIP_WIDTH <= viewportW - 8

    if (fits) return { top, left, placement: place }
  }

  // Nothing fits — clamp the bottom placement into the viewport.
  const top = Math.min(
    Math.max(rect.top + rect.height + TOOLTIP_GAP, 8),
    viewportH - estHeight - 8,
  )
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, 8),
    viewportW - TOOLTIP_WIDTH - 8,
  )
  return { top, left, placement: 'bottom' }
}

// The target rect, tooltip position and missing-target flag are all derived
// from a single measure pass, so they live in one reducer and update atomically
// (one dispatch per measure) instead of cascading separate setState calls.
interface Measurement {
  rect: Rect | null
  tooltipPos: TooltipPosition | null
  missingTarget: boolean
}

type MeasurementAction =
  | { type: 'measured'; rect: Rect; tooltipPos: TooltipPosition }
  | { type: 'missing' }

const initialMeasurement: Measurement = {
  rect: null,
  tooltipPos: null,
  missingTarget: false,
}

function measurementReducer(
  _state: Measurement,
  action: MeasurementAction,
): Measurement {
  switch (action.type) {
    case 'measured':
      return {
        rect: action.rect,
        tooltipPos: action.tooltipPos,
        missingTarget: false,
      }
    case 'missing':
      return { rect: null, tooltipPos: null, missingTarget: true }
    default:
      return initialMeasurement
  }
}

/**
 * Public entry point. Mounts the actual tour only while `open` is true so the
 * step index resets naturally on each open (fresh mount) — no derived
 * prev-prop state needed.
 */
export function TourGuide({ open, onClose }: TourGuideProps) {
  if (!open) return null
  if (typeof document === 'undefined') return null
  return <TourGuideContent onClose={onClose} />
}

function TourGuideContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [stepIndex, setStepIndex] = useState(0)
  const [{ rect, tooltipPos, missingTarget }, dispatchMeasurement] = useReducer(
    measurementReducer,
    initialMeasurement,
  )
  const rafRef = useRef<number | null>(null)

  // Filter steps to only those whose target currently exists in the DOM —
  // anonymous visitors don't have `daily-reward-badge` or `profile-menu`,
  // so we silently skip those rather than showing an empty spotlight.
  const visibleSteps = useMemo(() => {
    if (typeof document === 'undefined') return STEPS
    return STEPS.filter((s) => document.querySelector(`[data-tour="${s.target}"]`))
  }, [])

  const currentStep = visibleSteps[stepIndex]
  const isLast = stepIndex >= visibleSteps.length - 1

  const finish = useCallback(() => {
    markTourCompleted()
    onClose()
  }, [onClose])

  // Measure target + position tooltip on every step / resize / scroll.
  useLayoutEffect(() => {
    if (!currentStep) return

    const measure = () => {
      const r = getTargetRect(currentStep.target)
      if (!r) {
        dispatchMeasurement({ type: 'missing' })
        return
      }
      dispatchMeasurement({
        type: 'measured',
        rect: r,
        tooltipPos: computeTooltipPosition(r, currentStep.placement ?? 'bottom'),
      })
    }

    // Initial measure on next frame so target layout has settled.
    rafRef.current = requestAnimationFrame(measure)

    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [currentStep])

  // Scroll the target into view when stepping.
  useEffect(() => {
    if (!currentStep) return
    const el = document.querySelector<HTMLElement>(`[data-tour="${currentStep.target}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentStep])

  // Esc to skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') setStepIndex((i) => Math.min(i + 1, visibleSteps.length - 1))
      else if (e.key === 'ArrowLeft') setStepIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish, visibleSteps.length])

  if (!currentStep) return null
  if (typeof document === 'undefined') return null

  const handleNext = () => {
    if (isLast) finish()
    else setStepIndex((i) => i + 1)
  }
  const handlePrev = () => setStepIndex((i) => Math.max(i - 1, 0))

  // If the target isn't in the DOM, render an info panel centered on screen
  // rather than a misleading spotlight on nothing.
  const showFallback = missingTarget || !rect || !tooltipPos

  return createPortal(
    <dialog
      open
      aria-modal="true"
      aria-label={t('tour.ariaLabel')}
      className="fixed inset-0 z-[100] m-0 size-full max-h-none max-w-none bg-transparent p-0"
    >
      {/* Dim overlay with a transparent hole over the target. We use an SVG
          mask so we don't need to render four separate divs around the rect. */}
      {!showFallback && rect && (
        <svg
          className="absolute inset-0 size-full pointer-events-auto"
          aria-hidden="true"
          onClick={finish}
        >
          <defs>
            <mask id="tour-spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={rect.left - PADDING}
                y={rect.top - PADDING}
                width={rect.width + PADDING * 2}
                height={rect.height + PADDING * 2}
                rx={12}
                ry={12}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            className="fill-black"
            fillOpacity={0.72}
            mask="url(#tour-spotlight-mask)"
          />
        </svg>
      )}

      {/* Neon ring around the spotlight. */}
      {!showFallback && rect && (
        <div
          aria-hidden="true"
          className="absolute pointer-events-none rounded-xl ring-2 ring-neon-purple shadow-[var(--glow-lg)]"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
          }}
        />
      )}

      {/* Tooltip card. Falls back to a centered card when the target isn't
          on the current page. */}
      <div
        className="absolute rounded-lg border border-neon-purple/40 bg-card/95 backdrop-blur-sm shadow-2xl p-4 text-sm text-foreground"
        style={
          showFallback
            ? {
                top: '50%',
                left: '50%',
                width: TOOLTIP_WIDTH,
                transform: 'translate(-50%, -50%)',
              }
            : {
                top: tooltipPos!.top,
                left: tooltipPos!.left,
                width: TOOLTIP_WIDTH,
              }
        }
        role="document"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-neon-purple shrink-0" aria-hidden="true" />
            <h2 className="font-semibold text-foreground leading-tight">
              {t(currentStep.titleKey)}
            </h2>
          </div>
          <button
            type="button"
            onClick={finish}
            aria-label={t('tour.close')}
            className="text-muted-foreground hover:text-foreground transition-colors rounded p-1 -m-1"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-foreground/85 leading-relaxed mb-4">
          {t(currentStep.bodyKey)}
        </p>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {t('tour.progress', { current: stepIndex + 1, total: visibleSteps.length })}
          </span>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="ghost" size="sm" onClick={handlePrev}>
                <ArrowLeft className="size-3.5" />
                {t('tour.prev')}
              </Button>
            )}
            <Button variant="gaming" size="sm" onClick={handleNext}>
              {isLast ? t('tour.finish') : t('tour.next')}
              {!isLast && <ArrowRight className="size-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
