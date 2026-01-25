import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { Trophy, Play } from 'lucide-react'

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

  const handleSeeResults = async () => {
    setShowCompletionChoice(false)
    await endGameAction()
  }

  return (
    <Dialog open={showCompletionChoice}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Trophy className="w-5 h-5 text-primary" />
            {t('game.completionChoice.title')}
          </DialogTitle>
          <DialogDescription>
            {t('game.completionChoice.description', { count: remainingGames })}
          </DialogDescription>
        </DialogHeader>

        {/* Remaining games info */}
        <div className="flex flex-col items-center py-4">
          <div className="text-4xl font-bold text-primary mb-2">
            {remainingGames}
          </div>
          <p className="text-muted-foreground text-center">
            {t('game.completionChoice.gamesRemaining', { count: remainingGames })}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={handleContinuePlaying}
            variant="gaming"
            className="w-full"
          >
            <Play className="w-4 h-4 mr-2" />
            {t('game.completionChoice.continuePlaying')}
          </Button>
          <Button
            onClick={handleSeeResults}
            variant="outline"
            className="w-full"
          >
            <Trophy className="w-4 h-4 mr-2" />
            {t('game.completionChoice.seeResults')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
