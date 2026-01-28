import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useGameStore } from '@/stores/gameStore'
import { Flag, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'

export function EndGameButton() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showConfirm, setShowConfirm] = useState(false)
  const [isEnding, setIsEnding] = useState(false)

  const gamePhase = useGameStore((s) => s.gamePhase)
  const hasVisitedAllPositions = useGameStore((s) => s.hasVisitedAllPositions)
  const hasSkippedPositions = useGameStore((s) => s.hasSkippedPositions)
  const endGameAction = useGameStore((s) => s.endGameAction)
  const isSessionCompleted = useGameStore((s) => s.isSessionCompleted)

  // Show if playing, all positions visited, session not completed, and no skipped positions
  // When there are skipped positions, the completion choice modal handles ending the game
  const canShowButton = gamePhase === 'playing' && hasVisitedAllPositions() && !isSessionCompleted && !hasSkippedPositions()

  if (!canShowButton) return null

  const handleEndGame = async () => {
    setIsEnding(true)
    try {
      await endGameAction()
      setShowConfirm(false)
      navigate('/leaderboard')
    } catch (error) {
      // Show error toast to user
      const errorMessage = error instanceof Error ? error.message : 'Failed to end game'
      toast.error(t('game.endGame.error', { defaultValue: errorMessage }))
    } finally {
      setIsEnding(false)
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setShowConfirm(true)}
        className="gap-1.5 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3 touch-manipulation"
      >
        <Flag className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="text-xs sm:text-sm">{t('game.endGame.button')}</span>
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('game.endGame.confirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('game.endGame.confirmDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={isEnding}
              className="w-full sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleEndGame}
              disabled={isEnding}
              className="w-full sm:w-auto"
            >
              {isEnding && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t('game.endGame.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
