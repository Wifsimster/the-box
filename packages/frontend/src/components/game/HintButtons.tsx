import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useGameStore } from '@/stores/gameStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { Calendar, Building2, Code2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

/**
 * Hint buttons component for daily challenge
 * Displays Year, Publisher, and Developer hint buttons
 */
export function HintButtons() {
  const { t } = useTranslation()
  const { session } = useAuth()

  // Get inventory for hint counts
  const { inventory, fetchInventory } = useDailyLoginStore()
  const yearHintsInInventory = inventory?.powerups?.hint_year ?? 0
  const publisherHintsInInventory = inventory?.powerups?.hint_publisher ?? 0
  const developerHintsInInventory = inventory?.powerups?.hint_developer ?? 0

  // Fetch inventory on mount if not loaded
  useEffect(() => {
    if (!inventory && session?.user?.id) {
      fetchInventory()
    }
  }, [inventory, session?.user?.id, fetchInventory])

  const {
    gamePhase,
    currentPosition,
    positionStates,
    challengeId,
    availableHints,
    useHintYear,
    useHintPublisher,
    useHintDeveloper,
  } = useGameStore()

  // Daily challenge game mode
  const isDailyChallenge = challengeId !== null

  // Don't render if not in daily challenge mode
  if (!isDailyChallenge) return null

  // Get current position state for hint availability
  const currentPosState = positionStates[currentPosition]
  const hasIncorrectGuess = currentPosState?.hasIncorrectGuess || false
  const hintYearUsed = currentPosState?.hintYearUsed || false
  const hintPublisherUsed = currentPosState?.hintPublisherUsed || false
  const hintDeveloperUsed = currentPosState?.hintDeveloperUsed || false

  // Check if hints are available (data exists)
  const yearAvailable = availableHints?.year !== null && availableHints?.year !== undefined
  const publisherAvailable = availableHints?.publisher !== null && availableHints?.publisher !== undefined
  const developerAvailable = availableHints?.developer !== null && availableHints?.developer !== undefined

  const handleHintYear = () => {
    if (!hasIncorrectGuess || hintYearUsed || !yearAvailable) return
    // eslint-disable-next-line react-hooks/rules-of-hooks -- useHintYear is a store action, not a React hook
    useHintYear(currentPosition)
  }

  const handleHintPublisher = () => {
    if (!hasIncorrectGuess || hintPublisherUsed || !publisherAvailable) return
    // eslint-disable-next-line react-hooks/rules-of-hooks -- useHintPublisher is a store action, not a React hook
    useHintPublisher(currentPosition)
  }

  const handleHintDeveloper = () => {
    if (!hasIncorrectGuess || hintDeveloperUsed || !developerAvailable) return
    // eslint-disable-next-line react-hooks/rules-of-hooks -- useHintDeveloper is a store action, not a React hook
    useHintDeveloper(currentPosition)
  }

  return (
    <div className="flex justify-center gap-2">
      <Tooltip content={
        !hasIncorrectGuess
          ? t('game.hints.lockedTooltip')
          : !yearAvailable
            ? t('game.hints.unavailableYear')
            : hintYearUsed
              ? t('game.hints.alreadyUsed')
              : yearHintsInInventory > 0
                ? t('game.hints.yearTooltipFree', { count: yearHintsInInventory, defaultValue: `Release Year Hint (${yearHintsInInventory} free)` })
                : t('game.hints.yearTooltip', { defaultValue: 'Release Year Hint (-20%)' })
      }>
        <Button
          variant="outline"
          size="sm"
          onClick={handleHintYear}
          disabled={!hasIncorrectGuess || hintYearUsed || !yearAvailable || gamePhase !== 'playing'}
          className={`relative h-9 sm:h-10 px-3 sm:px-4 touch-manipulation transition-all duration-300 ${hintYearUsed
            ? 'bg-yellow-500/20 border-yellow-500 hover:bg-yellow-500/30'
            : yearHintsInInventory > 0
              ? 'border-green-500/50 hover:border-green-500'
              : ''
            }`}
        >
          <Calendar className={`h-4 w-4 transition-colors duration-300 ${hintYearUsed ? 'text-yellow-400' : ''}`} />
          {!hintYearUsed && hasIncorrectGuess && yearAvailable && (
            yearHintsInInventory > 0 ? (
              <Badge
                variant="outline"
                className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-bold bg-green-500/20 border-green-500 text-green-400"
              >
                {yearHintsInInventory}
              </Badge>
            ) : (
              <Badge
                variant="destructive"
                className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 flex items-center justify-center text-[10px] font-bold"
              >
                -20%
              </Badge>
            )
          )}
        </Button>
      </Tooltip>

      <Tooltip content={
        !hasIncorrectGuess
          ? t('game.hints.lockedTooltip')
          : !publisherAvailable
            ? t('game.hints.unavailablePublisher')
            : hintPublisherUsed
              ? t('game.hints.alreadyUsed')
              : publisherHintsInInventory > 0
                ? t('game.hints.publisherTooltipFree', { count: publisherHintsInInventory, defaultValue: `Publisher Hint (${publisherHintsInInventory} free)` })
                : t('game.hints.publisherTooltip', { defaultValue: 'Publisher Hint (-20%)' })
      }>
        <Button
          variant="outline"
          size="sm"
          onClick={handleHintPublisher}
          disabled={!hasIncorrectGuess || hintPublisherUsed || !publisherAvailable || gamePhase !== 'playing'}
          className={`relative h-9 sm:h-10 px-3 sm:px-4 touch-manipulation transition-all duration-300 ${hintPublisherUsed
            ? 'bg-yellow-500/20 border-yellow-500 hover:bg-yellow-500/30'
            : publisherHintsInInventory > 0
              ? 'border-green-500/50 hover:border-green-500'
              : ''
            }`}
        >
          <Building2 className={`h-4 w-4 transition-colors duration-300 ${hintPublisherUsed ? 'text-yellow-400' : ''}`} />
          {!hintPublisherUsed && hasIncorrectGuess && publisherAvailable && (
            publisherHintsInInventory > 0 ? (
              <Badge
                variant="outline"
                className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-bold bg-green-500/20 border-green-500 text-green-400"
              >
                {publisherHintsInInventory}
              </Badge>
            ) : (
              <Badge
                variant="destructive"
                className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 flex items-center justify-center text-[10px] font-bold"
              >
                -20%
              </Badge>
            )
          )}
        </Button>
      </Tooltip>

      <Tooltip content={
        !hasIncorrectGuess
          ? t('game.hints.lockedTooltip')
          : !developerAvailable
            ? t('game.hints.unavailableDeveloper')
            : hintDeveloperUsed
              ? t('game.hints.alreadyUsed')
              : developerHintsInInventory > 0
                ? t('game.hints.developerTooltipFree', { count: developerHintsInInventory, defaultValue: `Developer Hint (${developerHintsInInventory} free)` })
                : t('game.hints.developerTooltip', { defaultValue: 'Developer Hint (-20%)' })
      }>
        <Button
          variant="outline"
          size="sm"
          onClick={handleHintDeveloper}
          disabled={!hasIncorrectGuess || hintDeveloperUsed || !developerAvailable || gamePhase !== 'playing'}
          className={`relative h-9 sm:h-10 px-3 sm:px-4 touch-manipulation transition-all duration-300 ${hintDeveloperUsed
            ? 'bg-yellow-500/20 border-yellow-500 hover:bg-yellow-500/30'
            : developerHintsInInventory > 0
              ? 'border-green-500/50 hover:border-green-500'
              : ''
            }`}
        >
          <Code2 className={`h-4 w-4 transition-colors duration-300 ${hintDeveloperUsed ? 'text-yellow-400' : ''}`} />
          {!hintDeveloperUsed && hasIncorrectGuess && developerAvailable && (
            developerHintsInInventory > 0 ? (
              <Badge
                variant="outline"
                className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-bold bg-green-500/20 border-green-500 text-green-400"
              >
                {developerHintsInInventory}
              </Badge>
            ) : (
              <Badge
                variant="destructive"
                className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 flex items-center justify-center text-[10px] font-bold"
              >
                -20%
              </Badge>
            )
          )}
        </Button>
      </Tooltip>
    </div>
  )
}
