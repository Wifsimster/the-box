import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useGameStore } from '@/stores/gameStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { Calendar, Building2, Code2, Tag } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

type HintVariant = 'outline' | 'hintUsed' | 'hintFree'

function hintVariant(used: boolean, freeCount: number): HintVariant {
  if (used) return 'hintUsed'
  if (freeCount > 0) return 'hintFree'
  return 'outline'
}

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
  const genreHintsInInventory = inventory?.powerups?.hint_genre ?? 0

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
    useHintGenre,
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
  const hintGenreUsed = currentPosState?.hintGenreUsed || false

  // Check if hints are available (data exists)
  const yearAvailable = availableHints?.year !== null && availableHints?.year !== undefined
  const publisherAvailable = availableHints?.publisher !== null && availableHints?.publisher !== undefined
  const developerAvailable = availableHints?.developer !== null && availableHints?.developer !== undefined
  const genreAvailable = availableHints?.genre !== null && availableHints?.genre !== undefined

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

  const handleHintGenre = () => {
    if (!hasIncorrectGuess || hintGenreUsed || !genreAvailable) return
    // eslint-disable-next-line react-hooks/rules-of-hooks -- useHintGenre is a store action, not a React hook
    useHintGenre(currentPosition)
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
          variant={hintVariant(hintYearUsed, yearHintsInInventory)}
          size="sm"
          onClick={handleHintYear}
          disabled={!hasIncorrectGuess || hintYearUsed || !yearAvailable || gamePhase !== 'playing'}
          className="relative size-11 sm:h-10 sm:w-auto sm:px-4 p-0 touch-manipulation transition-all duration-300"
        >
          <Calendar className={cn('size-4 transition-colors duration-300', hintYearUsed && 'text-warning')} />
          {!hintYearUsed && hasIncorrectGuess && yearAvailable && (
            yearHintsInInventory > 0 ? (
              <Badge
                variant="success"
                className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-bold"
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
          variant={hintVariant(hintPublisherUsed, publisherHintsInInventory)}
          size="sm"
          onClick={handleHintPublisher}
          disabled={!hasIncorrectGuess || hintPublisherUsed || !publisherAvailable || gamePhase !== 'playing'}
          className="relative size-11 sm:h-10 sm:w-auto sm:px-4 p-0 touch-manipulation transition-all duration-300"
        >
          <Building2 className={cn('size-4 transition-colors duration-300', hintPublisherUsed && 'text-warning')} />
          {!hintPublisherUsed && hasIncorrectGuess && publisherAvailable && (
            publisherHintsInInventory > 0 ? (
              <Badge
                variant="success"
                className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-bold"
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
          variant={hintVariant(hintDeveloperUsed, developerHintsInInventory)}
          size="sm"
          onClick={handleHintDeveloper}
          disabled={!hasIncorrectGuess || hintDeveloperUsed || !developerAvailable || gamePhase !== 'playing'}
          className="relative size-11 sm:h-10 sm:w-auto sm:px-4 p-0 touch-manipulation transition-all duration-300"
        >
          <Code2 className={cn('size-4 transition-colors duration-300', hintDeveloperUsed && 'text-warning')} />
          {!hintDeveloperUsed && hasIncorrectGuess && developerAvailable && (
            developerHintsInInventory > 0 ? (
              <Badge
                variant="success"
                className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-bold"
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

      <Tooltip content={
        !hasIncorrectGuess
          ? t('game.hints.lockedTooltip')
          : !genreAvailable
            ? t('game.hints.unavailableGenre')
            : hintGenreUsed
              ? t('game.hints.alreadyUsed')
              : genreHintsInInventory > 0
                ? t('game.hints.genreTooltipFree', { count: genreHintsInInventory, defaultValue: `Genre Hint (${genreHintsInInventory} free)` })
                : t('game.hints.genreTooltip', { defaultValue: 'Genre Hint (-20%)' })
      }>
        <Button
          variant={hintVariant(hintGenreUsed, genreHintsInInventory)}
          size="sm"
          onClick={handleHintGenre}
          disabled={!hasIncorrectGuess || hintGenreUsed || !genreAvailable || gamePhase !== 'playing'}
          className="relative size-11 sm:h-10 sm:w-auto sm:px-4 p-0 touch-manipulation transition-all duration-300"
        >
          <Tag className={cn('size-4 transition-colors duration-300', hintGenreUsed && 'text-warning')} />
          {!hintGenreUsed && hasIncorrectGuess && genreAvailable && (
            genreHintsInInventory > 0 ? (
              <Badge
                variant="success"
                className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-bold"
              >
                {genreHintsInInventory}
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
