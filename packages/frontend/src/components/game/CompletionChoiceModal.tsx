import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from '@/components/ui/responsive-dialog'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { Trophy, Play, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'

export function CompletionChoiceModal() {
  const { t } = useTranslation()
  const {
    showCompletionChoice,
    setShowCompletionChoice,
    positionStates,
    findFirstSkipped,
    navigateToPosition,
    setGamePhase,
    endGameAction,
  } = useGameStore()

  // Count remaining unguessed games (skipped positions)
  const remainingGames = Object.values(positionStates).filter(
    (state) => state?.status === 'skipped'
  ).length

  const handleContinuePlaying = () => {
    const firstSkipped = findFirstSkipped()
    setShowCompletionChoice(false)
    if (firstSkipped) {
      navigateToPosition(firstSkipped)
      setGamePhase('playing')
    }
  }

  const [isEnding, setIsEnding] = useState(false)

  const handleSeeResults = async () => {
    setIsEnding(true)
    try {
      await endGameAction()
      setShowCompletionChoice(false)
    } catch {
      toast.error(t('game.endGame.error'))
    } finally {
      setIsEnding(false)
    }
  }

  return (
    <ResponsiveDialog open={showCompletionChoice}>
      <ResponsiveDialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2 text-xl">
            <Trophy className="size-5 text-primary" aria-hidden="true" />
            {t('game.completionChoice.title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('game.completionChoice.description', { count: remainingGames })}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/40 py-3 sm:py-4">
          <span className="text-4xl font-bold tabular-nums text-primary" aria-hidden="true">
            {remainingGames}
          </span>
          <p className="text-sm sm:text-base text-muted-foreground text-center">
            {t('game.completionChoice.gamesRemaining', { count: remainingGames })}
          </p>
        </div>

        <ResponsiveDialogFooter>
          <Button
            onClick={handleSeeResults}
            variant="outline"
            disabled={isEnding}
            aria-busy={isEnding}
            className="w-full sm:w-auto"
          >
            {isEnding ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trophy className="size-4" aria-hidden="true" />
            )}
            {t('game.completionChoice.seeResults')}
          </Button>
          <Button
            onClick={handleContinuePlaying}
            variant="gaming"
            size="lg"
            disabled={isEnding}
            className="w-full sm:w-auto"
          >
            <Play className="size-4" aria-hidden="true" />
            {t('game.completionChoice.continuePlaying')}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
