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
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

const UNFOUND_PENALTY = 50

export function EndGameButton() {
  const { t } = useTranslation()
  const [showConfirm, setShowConfirm] = useState(false)
  const [isEnding, setIsEnding] = useState(false)

  const gamePhase = useGameStore((s) => s.gamePhase)
  const positionStates = useGameStore((s) => s.positionStates)
  const hasVisitedAllPositions = useGameStore((s) => s.hasVisitedAllPositions)
  const hasSkippedPositions = useGameStore((s) => s.hasSkippedPositions)
  const endGameAction = useGameStore((s) => s.endGameAction)
  const totalScore = useGameStore((s) => s.totalScore)
  const isSessionCompleted = useGameStore((s) => s.isSessionCompleted)

  // Show if playing, all positions visited, session not completed, and no skipped positions
  // When there are skipped positions, the completion choice modal handles ending the game
  const canShowButton = gamePhase === 'playing' && hasVisitedAllPositions() && !isSessionCompleted && !hasSkippedPositions()

  if (!canShowButton) return null

  // Calculate unfound count for warning message
  const unfoundCount = Object.values(positionStates).filter(
    (s) => s.status !== 'correct'
  ).length
  const penaltyPreview = unfoundCount * UNFOUND_PENALTY
  const finalScore = totalScore - penaltyPreview

  // Determine score color based on value
  const getScoreColor = (score: number) => {
    if (score <= 0) return 'text-error'
    if (score >= 800) return 'text-success'
    if (score >= 500) return 'text-yellow-400'
    if (score >= 250) return 'text-orange-400'
    return 'text-error'
  }

  const handleEndGame = async () => {
    setIsEnding(true)
    try {
      await endGameAction()
      setShowConfirm(false)
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
              {t('game.endGame.confirmMessage', {
                unfound: unfoundCount,
                penalty: penaltyPreview,
              })}
            </DialogDescription>
          </DialogHeader>

          {/* Final Score */}
          <div className="bg-card border-2 border-border rounded-xl p-6 my-4">
            <div className="flex flex-col items-center justify-center text-center gap-2">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('game.endGame.finalScore')}
              </div>
              <div className={cn(
                "text-5xl font-black tabular-nums",
                getScoreColor(finalScore)
              )}>
                {finalScore}
              </div>
              <div className="text-sm text-muted-foreground">
                {t('game.endGame.points')}
              </div>
            </div>
          </div>
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
