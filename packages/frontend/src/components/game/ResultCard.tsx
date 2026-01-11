import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { CheckCircle, XCircle, ChevronRight, Clock, Zap, Target } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ResultCard() {
  const { t } = useTranslation()
  const {
    lastResult,
    currentPosition,
    totalScreenshots,
    setGamePhase,
    nextRound,
  } = useGameStore()

  if (!lastResult) return null

  const { isCorrect, correctGame, scoreEarned, timeTakenMs, userGuess } = lastResult
  const maxScore = 200
  const scorePercentage = (scoreEarned / maxScore) * 100
  const timeTakenSeconds = Math.round(timeTakenMs / 1000)

  // Determine speed feedback
  const getSpeedFeedback = () => {
    if (!isCorrect) return null
    if (timeTakenSeconds <= 5) return { key: 'lightning', icon: Zap, color: 'text-yellow-400' }
    if (timeTakenSeconds <= 15) return { key: 'fast', icon: Clock, color: 'text-green-400' }
    return { key: 'good', icon: Target, color: 'text-blue-400' }
  }

  const speedFeedback = getSpeedFeedback()

  const handleNext = () => {
    if (currentPosition < totalScreenshots) {
      nextRound()
      setGamePhase('playing')
    } else {
      setGamePhase('challenge_complete')
    }
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

        {/* User's wrong guess */}
        {!isCorrect && userGuess && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center text-sm text-muted-foreground mb-4"
          >
            {t('game.yourGuess')}: <span className="text-error line-through">{userGuess}</span>
          </motion.p>
        )}

        {/* Score Display */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-center mb-4"
        >
          <div className="flex items-center justify-center gap-2">
            <span
              className={cn(
                "text-5xl font-black",
                isCorrect
                  ? scorePercentage >= 80
                    ? "text-success"
                    : scorePercentage >= 50
                    ? "text-yellow-400"
                    : "text-orange-400"
                  : "text-muted-foreground"
              )}
            >
              +{scoreEarned}
            </span>
            <span className="text-lg text-muted-foreground font-medium">pts</span>
          </div>

          {/* Speed feedback for correct answers */}
          {isCorrect && speedFeedback && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className={cn("flex items-center justify-center gap-1.5 mt-2 text-sm", speedFeedback.color)}
            >
              <speedFeedback.icon className="w-4 h-4" />
              <span>{t(`game.speed.${speedFeedback.key}`)}</span>
              <span className="text-muted-foreground">• {timeTakenSeconds}s</span>
            </motion.div>
          )}
        </motion.div>

        {/* Score Progress Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mb-6"
        >
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>0</span>
            <span>{maxScore} pts max</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${scorePercentage}%` }}
              transition={{ delay: 0.5, duration: 0.6, ease: 'easeOut' }}
              className={cn(
                "h-full rounded-full",
                isCorrect
                  ? scorePercentage >= 80
                    ? "bg-gradient-to-r from-success to-emerald-400"
                    : scorePercentage >= 50
                    ? "bg-gradient-to-r from-yellow-500 to-yellow-400"
                    : "bg-gradient-to-r from-orange-500 to-orange-400"
                  : "bg-muted-foreground/50"
              )}
            />
          </div>
        </motion.div>

        {/* Next Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Button
            variant="gaming"
            size="lg"
            onClick={handleNext}
            className="w-full gap-2 font-bold"
          >
            {currentPosition < totalScreenshots
              ? t('game.nextRound')
              : t('game.viewResults')}
            <ChevronRight className="w-5 h-5" />
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
