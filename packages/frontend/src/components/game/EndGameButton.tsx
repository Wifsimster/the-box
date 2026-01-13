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
import { Flag, Loader2, Trophy, Minus, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const UNFOUND_PENALTY = 50

export function EndGameButton() {
  const { t } = useTranslation()
  const [showConfirm, setShowConfirm] = useState(false)
  const [isEnding, setIsEnding] = useState(false)

  const gamePhase = useGameStore((s) => s.gamePhase)
  const positionStates = useGameStore((s) => s.positionStates)
  const currentPosition = useGameStore((s) => s.currentPosition)
  const totalScreenshots = useGameStore((s) => s.totalScreenshots)
  const hasVisitedAllPositions = useGameStore((s) => s.hasVisitedAllPositions)
  const endGameAction = useGameStore((s) => s.endGameAction)
  const totalScore = useGameStore((s) => s.totalScore)

  // Hide on last position (terminer button is shown next to input instead)
  const isLastPosition = currentPosition === totalScreenshots
  
  // Only show if playing and all positions visited, but not on last position
  const canShowButton = gamePhase === 'playing' && hasVisitedAllPositions() && !isLastPosition

  if (!canShowButton) return null

  // Calculate unfound count for warning message
  const unfoundCount = Object.values(positionStates).filter(
    (s) => s.status !== 'correct'
  ).length
  const penaltyPreview = unfoundCount * UNFOUND_PENALTY
  const finalScore = Math.max(0, totalScore - penaltyPreview)

  // Determine score color based on value
  // Max possible score is 1000 (10 screenshots * 100 points max with 2.0x multiplier)
  const getScoreColor = (score: number) => {
    if (score === 0) return 'text-destructive'
    if (score >= 800) return 'text-green-500' // High score (80%+)
    if (score >= 500) return 'text-yellow-400' // Medium-high (50%+)
    if (score >= 250) return 'text-orange-400' // Medium (25%+)
    return 'text-red-500' // Low
  }

  const getScoreBgColor = (score: number) => {
    if (score === 0) return 'bg-gradient-to-br from-destructive/30 via-destructive/20 to-destructive/10 border-destructive/50'
    if (score >= 800) return 'bg-gradient-to-br from-green-500/30 via-green-500/20 to-green-500/10 border-green-500/50'
    if (score >= 500) return 'bg-gradient-to-br from-yellow-500/30 via-yellow-500/20 to-yellow-500/10 border-yellow-500/50'
    if (score >= 250) return 'bg-gradient-to-br from-orange-500/30 via-orange-500/20 to-orange-500/10 border-orange-500/50'
    return 'bg-gradient-to-br from-red-500/30 via-red-500/20 to-red-500/10 border-red-500/50'
  }

  const getScoreGlow = (score: number) => {
    if (score === 0) return 'drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]'
    if (score >= 800) return 'drop-shadow-[0_0_20px_rgba(34,197,94,0.6)]'
    if (score >= 500) return 'drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]'
    if (score >= 250) return 'drop-shadow-[0_0_20px_rgba(249,115,22,0.6)]'
    return 'drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]'
  }

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
          
          {/* Score Section */}
          <div className="space-y-4 py-4">
            {/* Total User Score Card - Prominent */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/30 via-primary/20 to-primary/10 border-2 border-primary/50 p-6 shadow-lg">
              <div className="flex flex-col items-center justify-center text-center space-y-2">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/30 mb-2">
                  <Trophy className="w-6 h-6 text-primary" />
                </div>
                <div className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
                  {t('game.endGame.currentScore')}
                </div>
                <div className={cn(
                  "text-5xl font-black tabular-nums leading-none",
                  getScoreColor(totalScore || 0),
                  getScoreGlow(totalScore || 0)
                )}>
                  {totalScore || 0}
                </div>
                <div className="text-base font-medium text-foreground/60">
                  {t('game.endGame.points')}
                </div>
              </div>
            </div>

            {/* Penalty Card */}
            {penaltyPreview > 0 && (
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-destructive/20 via-destructive/15 to-destructive/10 border-2 border-destructive/40 p-4 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-destructive/30">
                      <TrendingDown className="w-5 h-5 text-destructive" />
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-foreground/70">
                        {t('game.endGame.penaltyApplied')}
                      </div>
                      <div className="text-2xl font-bold text-destructive mt-0.5">
                        -{penaltyPreview} <span className="text-sm font-normal text-foreground/60">{t('game.endGame.points')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Final Score Card - Centered and Prominent */}
            <div className={cn(
              "relative overflow-hidden rounded-2xl border-2 p-8 shadow-2xl",
              getScoreBgColor(finalScore)
            )}>
              <div className="flex flex-col items-center justify-center text-center space-y-3">
                <div className="text-sm font-semibold uppercase tracking-widest text-foreground/70">
                  {t('game.endGame.finalScore')}
                </div>
                <div className={cn(
                  "text-6xl font-black tabular-nums leading-none",
                  getScoreColor(finalScore),
                  getScoreGlow(finalScore)
                )}>
                  {finalScore}
                </div>
                <div className="text-lg font-medium text-foreground/60">
                  {t('game.endGame.points')}
                </div>
              </div>
            </div>
          </div>
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
