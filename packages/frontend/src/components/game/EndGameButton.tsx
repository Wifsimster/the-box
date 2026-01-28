import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useGameStore } from '@/stores/gameStore'
import { Flag, Loader2, Trophy } from 'lucide-react'
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

  // Pick a random fun sentence when dialog opens
  const funSentence = useMemo(() => {
    const sentences = t('game.endGame.confirmDescriptions', { returnObjects: true }) as string[]
    return sentences[Math.floor(Math.random() * sentences.length)]
  }, [showConfirm, t]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 ring-2 ring-primary/30">
              <Trophy className="h-8 w-8 text-primary" />
            </div>
            <DialogTitle className="text-xl">{t('game.endGame.confirmTitle')}</DialogTitle>
          </DialogHeader>

          <div className="py-4 text-center">
            <p className="text-muted-foreground text-base italic">
              "{funSentence}"
            </p>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="gaming"
              onClick={handleEndGame}
              disabled={isEnding}
              className="w-full"
            >
              {isEnding ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trophy className="w-4 h-4 mr-2" />
              )}
              {t('game.endGame.confirm')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowConfirm(false)}
              disabled={isEnding}
              className="w-full"
            >
              {t('common.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
