import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { CaseSensitive, Gift, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLetterReveal } from '@/hooks/useLetterReveal'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * Trigger device haptics when supported. Pure helper with no component state.
 */
function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern)
    } catch {
      // ignore unsupported
    }
  }
}

const DESCRIPTION_ID = 'letter-reveal-description'

/**
 * Masked-title bar fused to the top edge of the guess input — mask glyphs
 * on the left, running penalty tag and the reveal button on the right.
 * Presentational only: all reveal logic lives in `useLetterReveal`.
 *
 * The button is never `disabled`: locked / no-inventory states use
 * `aria-disabled` and a tap fires an explanatory toast, so touch and
 * screen-reader users always get told WHY instead of a dead control.
 */
export function LetterRevealBar() {
  const { t } = useTranslation()
  const prefersReducedMotion = useReducedMotionSafe()
  const {
    status,
    letterState,
    isRevealing,
    isRankedDaily,
    inventoryCount,
    lastRevealedLetter,
    reveal,
  } = useLetterReveal()

  if (status === 'hidden' || !letterState) return null

  const nextPenaltyPct = letterState.nextPenaltyPct ?? 0
  const useInventoryPath = status === 'ready' && isRankedDaily && inventoryCount > 0

  // Full state copy — visible label stays terse, this feeds the sr-only
  // description the button points at via aria-describedby.
  const description =
    status === 'locked'
      ? t('game.hints.lockedTooltip')
      : status === 'cap-reached'
        ? t('game.hints.letterCapReached')
        : status === 'no-inventory'
          ? t('game.hints.letterNoInventory')
          : useInventoryPath
            ? t('game.hints.letterTooltipItem', {
                count: inventoryCount,
                penalty: nextPenaltyPct,
              })
            : t('game.hints.letterTooltip', { penalty: nextPenaltyPct })

  const handleClick = () => {
    if (status === 'locked') {
      toast.info(t('game.hints.lockedTooltip'))
      vibrate(10)
      return
    }
    if (status === 'no-inventory') {
      toast.info(t('game.hints.letterNoInventory'))
      return
    }
    if (status === 'ready' && !isRevealing) {
      void reveal()
    }
  }

  const buttonLabel =
    status === 'locked'
      ? t('game.hints.letterLockedShort')
      : status === 'no-inventory'
        ? t('game.hints.letterNoInventoryShort')
        : useInventoryPath
          ? t('game.hints.letterButtonWithCount', { count: inventoryCount })
          : t('game.hints.letterButtonWithPenalty', { penalty: nextPenaltyPct })

  const ButtonIcon =
    status === 'locked' ? Lock : status === 'no-inventory' ? Gift : CaseSensitive

  return (
    <div
      role="group"
      aria-label={t('game.hints.letterMaskAria', {
        revealed: letterState.lettersRevealed,
      })}
      className="flex items-center gap-2 h-10 sm:h-11 pl-3 sm:pl-4 pr-1.5 sm:pr-2 border-b border-primary/20"
    >
      {/* Visual mask — glyphs are decorative; the accessible name is the
          group's aria-label, and reveals are announced via the live region
          below. Before the first paid reveal the server sends an empty
          mask (even the letter count is part of what a reveal buys), so we
          show a neutral placeholder instead of the skeleton. */}
      <div
        data-testid="masked-title"
        className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap font-mono tracking-wide select-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {letterState.maskedTitle === '' ? (
          <span aria-hidden="true" className="text-muted-foreground/70 italic">
            {t('game.hints.maskHiddenPlaceholder')}
          </span>
        ) : (
          <span aria-hidden="true">
            {letterState.maskedTitle.split('').map((char, i) => (
              <m.span
                // Keyed on the char so a '_' flipping to a letter remounts
                // and replays the entrance animation for that glyph only.
                key={`${i}-${char}`}
                initial={
                  prefersReducedMotion ? { opacity: 0 } : { scale: 1.4, opacity: 0 }
                }
                animate={
                  prefersReducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }
                }
                transition={
                  prefersReducedMotion
                    ? { duration: 0.3 }
                    : { duration: 0.3, type: 'spring', bounce: 0.4 }
                }
                className={cn(
                  'inline-block',
                  char === '_'
                    ? 'text-muted-foreground/70'
                    : 'text-primary font-semibold'
                )}
              >
                {char === ' ' ? ' ' : char}
              </m.span>
            ))}
          </span>
        )}
      </div>

      {/* Running penalty tag — stays as residue after the cap unmounts the button. */}
      {letterState.penaltyPct > 0 && (
        <span
          data-testid="letter-penalty-badge"
          className="shrink-0 text-[11px] tabular-nums text-error/90"
        >
          <span className="sr-only">
            {t('game.hints.letterPenaltyCurrent', { penalty: letterState.penaltyPct })}
          </span>
          <span aria-hidden="true">-{letterState.penaltyPct}%</span>
        </span>
      )}

      {/* Reveal button — unmounts entirely once the cap is reached. */}
      {status !== 'cap-reached' && (
        <Button
          data-testid="letter-reveal-button"
          variant={useInventoryPath ? 'hintFree' : 'outline'}
          size="sm"
          onClick={handleClick}
          // Keep the mobile keyboard open: the tap must never blur the input.
          onPointerDown={(e) => e.preventDefault()}
          aria-disabled={status !== 'ready' || isRevealing}
          aria-describedby={DESCRIPTION_ID}
          className={cn(
            'shrink-0 h-8 sm:h-9 px-2.5 sm:px-3 touch-manipulation transition-all duration-300',
            (status === 'locked' || status === 'no-inventory') &&
              'text-muted-foreground border-border/60'
          )}
        >
          {isRevealing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ButtonIcon className="size-4" aria-hidden="true" />
          )}
          {buttonLabel}
        </Button>
      )}

      {/* Full state copy for assistive tech (the visible label is terse). */}
      <span id={DESCRIPTION_ID} className="sr-only">
        {description}
      </span>

      {/* Polite announcement of each revealed letter — kept separate from
          GuessInput's correct/incorrect live regions. */}
      <div aria-live="polite" className="sr-only">
        {lastRevealedLetter &&
          t('game.hints.letterRevealAnnounce', {
            letter: lastRevealedLetter,
            revealed: letterState.lettersRevealed,
            max: letterState.maxLetters,
          })}
      </div>
    </div>
  )
}
