import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CaseSensitive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useGameStore } from '@/stores/gameStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { gameApi } from '@/lib/api/game'
import { cn } from '@/lib/utils'

/**
 * Masked-title letter-reveal hint for the daily challenge.
 *
 * The skeleton (word count + lengths) is free and visible from the start;
 * each tap on "Révéler une lettre" asks the server for one more letter.
 * Everything that matters is server-authoritative — the gate (one wrong
 * guess first), the per-title cap, the inventory consumption on the ranked
 * daily and the score penalty are all enforced by POST /reveal-letter;
 * this component only mirrors those rules for affordance.
 */
export function MaskedTitle() {
  const { t } = useTranslation()
  const [isRevealing, setIsRevealing] = useState(false)

  const { inventory, fetchInventory } = useDailyLoginStore()
  const letterItemsInInventory = inventory?.powerups?.hint_letter ?? 0

  const {
    gamePhase,
    challengeId,
    challengeDate,
    tierSessionId,
    currentPosition,
    currentScreenshotData,
    positionStates,
    setLetterRevealState,
  } = useGameStore()

  // Daily challenge only, while playing.
  if (challengeId === null || gamePhase !== 'playing') return null

  const positionState = positionStates[currentPosition]
  // Position-state copy wins (updated after each reveal); the screenshot
  // payload seeds it on fetch.
  const letterState =
    positionState?.letterReveal ??
    (currentScreenshotData?.position === currentPosition
      ? currentScreenshotData?.letterReveal
      : undefined)
  if (!letterState || !tierSessionId) return null

  const hasIncorrectGuess = positionState?.hasIncorrectGuess || false
  const capReached = letterState.lettersRevealed >= letterState.maxLetters

  // Mirror of the server's catch-up rule: only today's challenge is the
  // ranked daily, and only the ranked daily is inventory-gated.
  const todayStr = new Date().toISOString().split('T')[0]
  const isRankedDaily = challengeDate === todayStr
  const missingInventory = isRankedDaily && letterItemsInInventory === 0

  const disabled =
    isRevealing || !hasIncorrectGuess || capReached || missingInventory

  const handleReveal = async () => {
    if (disabled) return
    setIsRevealing(true)
    try {
      const result = await gameApi.revealLetter({
        tierSessionId,
        position: currentPosition,
      })
      setLetterRevealState(currentPosition, result)
      if (result.fromInventory) {
        fetchInventory().catch(console.error)
      }
    } catch (error) {
      // Server is authoritative — a 402/409 here just means our local
      // mirror of the gate was stale; the button state will catch up.
      console.error('Letter reveal failed:', error)
    } finally {
      setIsRevealing(false)
    }
  }

  const tooltip = !hasIncorrectGuess
    ? t('game.hints.lockedTooltip')
    : capReached
      ? t('game.hints.letterCapReached')
      : missingInventory
        ? t('game.hints.letterNoInventory')
        : isRankedDaily
          ? t('game.hints.letterTooltipItem', {
              count: letterItemsInInventory,
              penalty: letterState.nextPenaltyPct ?? 0,
            })
          : t('game.hints.letterTooltip', { penalty: letterState.nextPenaltyPct ?? 0 })

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Visual mask — glyphs are decorative; the accessible name is the
          aria-label, and reveals are announced via the live region below. */}
      <div
        className="font-mono text-base sm:text-lg tracking-[0.2em] select-none"
        aria-label={t('game.hints.letterMaskAria', {
          revealed: letterState.lettersRevealed,
        })}
      >
        <span aria-hidden="true">
          {letterState.maskedTitle.split('').map((char, i) => (
            <span
              key={i}
              className={cn(
                char === '_' ? 'text-muted-foreground/50' : 'text-primary font-semibold'
              )}
            >
              {char}
            </span>
          ))}
        </span>
      </div>
      <div aria-live="polite" className="sr-only">
        {letterState.lettersRevealed > 0 &&
          t('game.hints.letterMaskAria', { revealed: letterState.lettersRevealed })}
      </div>

      <Tooltip content={tooltip}>
        <Button
          variant={letterItemsInInventory > 0 && !capReached ? 'hintFree' : 'outline'}
          size="sm"
          onClick={handleReveal}
          disabled={disabled}
          className="relative h-9 px-4 touch-manipulation transition-all duration-300"
        >
          <CaseSensitive className="size-4 mr-1.5" />
          {t('game.hints.letterButton')}
          {!capReached && hasIncorrectGuess && (
            <>
              {isRankedDaily && letterItemsInInventory > 0 && (
                <Badge
                  variant="success"
                  className="absolute -top-1.5 -left-1.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-bold"
                >
                  {letterItemsInInventory}
                </Badge>
              )}
              {letterState.nextPenaltyPct != null && letterState.nextPenaltyPct > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 flex items-center justify-center text-[10px] font-bold"
                >
                  -{letterState.nextPenaltyPct}%
                </Badge>
              )}
            </>
          )}
        </Button>
      </Tooltip>

      {letterState.penaltyPct > 0 && (
        <span className="text-[11px] text-muted-foreground">
          {t('game.hints.letterPenaltyCurrent', { penalty: letterState.penaltyPct })}
        </span>
      )}
    </div>
  )
}
