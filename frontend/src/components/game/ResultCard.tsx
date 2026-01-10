import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { CheckCircle, XCircle, ChevronRight } from 'lucide-react'
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

  const { isCorrect, correctGame, scoreEarned, timeTakenMs } = lastResult
  const maxScore = 200
  const scorePercentage = (scoreEarned / maxScore) * 100

  const handleNext = () => {
    if (currentPosition < totalScreenshots) {
      nextRound()
      setGamePhase('playing')
    } else {
      setGamePhase('tier_complete')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        className="bg-card border border-border rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
      >
        {/* Game Cover/Title */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-4">{correctGame.name}</h2>

          {/* Game Cover Image */}
          <div className="relative w-48 h-48 mx-auto mb-4 rounded-lg overflow-hidden bg-muted">
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

            {/* Correct/Incorrect Badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className={cn(
                "absolute -top-2 -right-2 w-12 h-12 rounded-full flex items-center justify-center",
                isCorrect ? "bg-success" : "bg-error"
              )}
            >
              {isCorrect ? (
                <CheckCircle className="w-6 h-6 text-white" />
              ) : (
                <XCircle className="w-6 h-6 text-white" />
              )}
            </motion.div>
          </div>
        </div>

        {/* Score Animation */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mb-6"
        >
          <span
            className={cn(
              "text-4xl font-bold",
              isCorrect ? "text-success" : "text-muted-foreground"
            )}
          >
            +{scoreEarned}
          </span>
        </motion.div>

        {/* Score Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>0</span>
            <span>{maxScore}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${scorePercentage}%` }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className={cn(
                "h-full rounded-full",
                isCorrect ? "bg-success" : "bg-muted-foreground"
              )}
            />
          </div>
        </div>

        {/* Next Button */}
        <Button
          variant="gaming"
          size="lg"
          onClick={handleNext}
          className="w-full gap-2"
        >
          {currentPosition < totalScreenshots
            ? t('game.nextRound')
            : t('game.viewResults')}
          <ChevronRight className="w-5 h-5" />
        </Button>
      </motion.div>
    </motion.div>
  )
}
