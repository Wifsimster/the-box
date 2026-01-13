import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { CheckCircle, XCircle, ChevronRight, Clock, Zap, Target } from 'lucide-react'
import { cn, calculateSpeedMultiplier } from '@/lib/utils'

const AUTO_CLOSE_SECONDS = 5

export function ResultCard() {
  const { t } = useTranslation()
  const {
    lastResult,
    currentPosition,
    totalScreenshots,
    setGamePhase,
    findNextUnfinished,
    navigateToPosition,
    positionStates,
  } = useGameStore()

  // Auto-close countdown state (must be before early return)
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SECONDS)

  // Memoize nextPosition calculation
  const nextPosition = lastResult ? findNextUnfinished(currentPosition) : null

  const handleNext = useCallback(() => {
    if (nextPosition) {
      // Navigate to next unfinished position
      navigateToPosition(nextPosition)
      // Initialize position state if not visited
      const nextState = positionStates[nextPosition]
      if (!nextState || nextState.status === 'not_visited') {
        useGameStore.setState((state) => ({
          positionStates: {
            ...state.positionStates,
            [nextPosition]: {
              position: nextPosition,
              status: 'in_progress',
              isCorrect: false,
            },
          },
        }))
      }
      setGamePhase('playing')
    } else {
      // All positions finished - show completion
      setGamePhase('challenge_complete')
    }
  }, [nextPosition, navigateToPosition, positionStates, setGamePhase])

  // Auto-close timer - only runs when there's a next position (must be before early return)
  useEffect(() => {
    if (!lastResult || !nextPosition) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [lastResult, nextPosition])

  // Separate effect to handle auto-navigation when countdown reaches 0
  useEffect(() => {
    if (countdown === 0 && lastResult && nextPosition) {
      handleNext()
    }
  }, [countdown, lastResult, nextPosition, handleNext])

  // Early return after all hooks
  if (!lastResult) return null

  const { isCorrect, correctGame, scoreEarned, timeTakenMs, userGuess } = lastResult
  const maxScore = 200
  const scorePercentage = (scoreEarned / maxScore) * 100
  const timeTakenSeconds = Math.round(timeTakenMs / 1000)

  // Check if there are any unfinished positions (for button text)
  const hasSkippedPositions = Object.values(positionStates).some(
    (state) => state.status === 'skipped'
  )

  // Format time display (e.g., "5s", "1:23", "10:05")
  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`
    }
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  const timeDisplay = formatTime(timeTakenSeconds)

  // Determine speed feedback
  const getSpeedFeedback = () => {
    if (!isCorrect) return null
    if (timeTakenSeconds <= 5) return { key: 'lightning', icon: Zap, color: 'text-yellow-400' }
    if (timeTakenSeconds <= 15) return { key: 'fast', icon: Clock, color: 'text-green-400' }
    return { key: 'good', icon: Target, color: 'text-blue-400' }
  }

  const speedFeedback = getSpeedFeedback()

  // Determine button text
  const getButtonText = () => {
    if (!nextPosition) {
      return t('game.viewResults')
    }
    if (hasSkippedPositions && nextPosition < currentPosition) {
      return t('game.navigation.reviewSkipped', 'Review Skipped')
    }
    return t('game.nextRound')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-background/90 backdrop-blur-lg"
    >
      {/* Success particles/glow effect */}
      {isCorrect && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 pointer-events-none"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-success/20 rounded-full blur-3xl" />
        </motion.div>
      )}

      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          "relative bg-card border-2 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl",
          isCorrect ? "border-success/50" : "border-error/50"
        )}
      >
        {/* Round Progress Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-muted rounded-full text-xs font-medium text-muted-foreground border border-border"
        >
          {t('game.round')} {currentPosition} / {totalScreenshots}
        </motion.div>

        {/* Result Status Header */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 400 }}
          className="text-center mb-4 pt-2"
        >
          <div
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold",
              isCorrect
                ? "bg-success/20 text-success"
                : "bg-error/20 text-error"
            )}
          >
            {isCorrect ? (
              <>
                <CheckCircle className="w-5 h-5" />
                {t('game.correct')}
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5" />
                {t('game.incorrect')}
              </>
            )}
          </div>
        </motion.div>

        {/* Game Cover Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="relative w-40 h-52 mx-auto mb-4 rounded-xl overflow-hidden shadow-xl ring-2 ring-white/10"
        >
          {correctGame.coverImageUrl ? (
            <img
              src={correctGame.coverImageUrl}
              alt={correctGame.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neon-purple/30 to-neon-pink/30">
              <span className="text-4xl font-bold">{correctGame.name[0]}</span>
            </div>
          )}
        </motion.div>

        {/* Game Title */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-xl font-bold text-center mb-2 line-clamp-2"
        >
          {correctGame.name}
        </motion.h2>

        {/* Game Details (Release Year and Metascore) */}
        {(correctGame.releaseYear || correctGame.metacritic != null) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-4 text-sm text-muted-foreground mb-4"
          >
            {correctGame.releaseYear && (
              <span>{t('game.releaseYear')}: <span className="text-foreground font-medium">{correctGame.releaseYear}</span></span>
            )}
            {correctGame.metacritic != null && (
              <span className={cn(
                "font-medium",
                correctGame.metacritic >= 75 ? "text-green-400" :
                correctGame.metacritic >= 50 ? "text-yellow-400" :
                "text-orange-400"
              )}>
                {t('game.metascore')}: {correctGame.metacritic}
              </span>
            )}
          </motion.div>
        )}

        {/* User's wrong guess */}
        {!isCorrect && userGuess && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-center text-sm text-muted-foreground mb-4"
          >
            {t('game.yourGuess')}: <span className="text-error line-through">{userGuess}</span>
          </motion.p>
        )}

        {/* Score Display */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center mb-6"
        >
          {isCorrect && scoreEarned > 0 ? (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center justify-center gap-2">
                <span
                  className={cn(
                    "text-5xl font-black",
                    scorePercentage >= 80
                      ? "text-success"
                      : scorePercentage >= 50
                        ? "text-yellow-400"
                        : "text-orange-400"
                  )}
                >
                  +50
                </span>
                <span className="text-5xl font-black text-muted-foreground">×</span>
                <span
                  className={cn(
                    "text-5xl font-black",
                    scorePercentage >= 80
                      ? "text-success"
                      : scorePercentage >= 50
                        ? "text-yellow-400"
                        : "text-orange-400"
                  )}
                >
                  {calculateSpeedMultiplier(timeTakenMs).toFixed(1)}
                </span>
              </div>
              <span className="text-lg text-muted-foreground font-medium">pts</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span className="text-5xl font-black text-muted-foreground">
                +{scoreEarned}
              </span>
              <span className="text-lg text-muted-foreground font-medium">pts</span>
            </div>
          )}

          {/* Speed feedback for correct answers */}
          {isCorrect && speedFeedback && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.55 }}
              className={cn("flex items-center justify-center gap-1.5 mt-2 text-sm", speedFeedback.color)}
            >
              <speedFeedback.icon className="w-4 h-4" />
              <span>{t(`game.speed.${speedFeedback.key}`)}</span>
              <span className="text-muted-foreground">• {timeDisplay}</span>
            </motion.div>
          )}
        </motion.div>

        {/* Next Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          <Button
            variant="secondary"
            size="lg"
            onClick={handleNext}
            className="w-full gap-2 font-bold"
          >
            {nextPosition ? `${getButtonText()} (${countdown}s)` : getButtonText()}
            <ChevronRight className="w-5 h-5" />
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
