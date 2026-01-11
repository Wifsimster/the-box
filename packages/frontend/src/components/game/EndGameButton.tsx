import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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

const UNFOUND_PENALTY = 100

export function EndGameButton() {
  const { t } = useTranslation()
  const [showConfirm, setShowConfirm] = useState(false)
  const [isEnding, setIsEnding] = useState(false)

  const gamePhase = useGameStore((s) => s.gamePhase)
  const positionStates = useGameStore((s) => s.positionStates)
  const hasVisitedAllPositions = useGameStore((s) => s.hasVisitedAllPositions)
  const endGameAction = useGameStore((s) => s.endGameAction)

  // Only show if playing and all positions visited
  const canShowButton = gamePhase === 'playing' && hasVisitedAllPositions()

  if (!canShowButton) return null

  // Calculate unfound count for warning message
  const unfoundCount = Object.values(positionStates).filter(
    (s) => s.status !== 'correct'
  ).length
  const penaltyPreview = unfoundCount * UNFOUND_PENALTY

  const handleEndGame = async () => {
    setIsEnding(true)
    try {
      await endGameAction()
      setShowConfirm(false)
    } catch {
      // Error handled in store
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
        className="gap-2"
      >
        <Flag className="w-4 h-4" />
        {t('game.endGame.button')}
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('game.endGame.confirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('game.endGame.confirmMessage', {
                unfound: unfoundCount,
                penalty: penaltyPreview,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={isEnding}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleEndGame}
              disabled={isEnding}
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
