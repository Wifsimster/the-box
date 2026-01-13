import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useGameStore } from '@/stores/gameStore'
import { Trophy, Home, CheckCircle, XCircle, Award, Clock } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { usePercentileRank } from '@/hooks/usePercentileRank'
import { PercentileBanner } from '@/components/game/PercentileBanner'
import { calculateSpeedMultiplier } from '@/lib/utils'

export default function ResultsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { totalScore, correctAnswers, totalScreenshots, guessResults, resetGame } = useGameStore()

  const accuracy = totalScreenshots > 0 ? Math.round((correctAnswers / totalScreenshots) * 100) : 0

  // Fetch percentile ranking
  const { percentile, rank, totalPlayers, isLoading: isLoadingPercentile } = usePercentileRank(
    totalScore,
    totalScore > 0
  )

  const handlePlayAgain = () => {
    resetGame()
    navigate(localizedPath('/play'))
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
          className="inline-flex items-center justify-center w-20 h-20 mb-4 rounded-full bg-linear-to-br from-neon-purple to-neon-pink shadow-lg shadow-neon-purple/30"
        >
          <Trophy className="w-10 h-10 text-white" />
        </motion.div>

        <h1 className="text-3xl font-bold mb-2 bg-linear-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent">{t('game.tierComplete')}</h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-5xl font-bold text-primary mb-4"
        >
          {totalScore} pts
        </motion.div>

        <div className="flex justify-center gap-8 text-muted-foreground">
          <div>
            <span className="text-foreground font-bold text-xl">{correctAnswers}</span>
            <span className="text-sm">/{totalScreenshots}</span>
            <p className="text-xs">{t('game.correctAnswers')}</p>
          </div>
          <div>
            <span className="text-foreground font-bold text-xl">{accuracy}%</span>
            <p className="text-xs">{t('game.accuracy')}</p>
          </div>
        </div>
      </motion.div>

      {/* Percentile Ranking Banner */}
      <PercentileBanner
        percentile={percentile}
        rank={rank}
        totalPlayers={totalPlayers}
        isLoading={isLoadingPercentile}
      />

      {/* Action Buttons */}
      <div className="flex justify-center gap-4 mb-8 flex-wrap">
        <Button variant="outline" size="lg" onClick={() => navigate(localizedPath('/'))}>
          <Home className="w-4 h-4 mr-2" />
          {t('common.home')}
        </Button>
        <Button variant="gaming" size="lg" onClick={() => navigate(localizedPath('/leaderboard'))}>
          <Award className="w-4 h-4 mr-2" />
          {t('common.leaderboard')}
        </Button>
      </div>

      {/* Results Summary */}
      <Card className="bg-card/50 border-border">
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4">{t('game.resultsSummary')}</h3>
          <div className="space-y-2">
            {guessResults.map((result, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50"
              >
                <span className="text-muted-foreground w-6">{index + 1}.</span>
                {result.isCorrect ? (
                  <CheckCircle className="w-5 h-5 text-success" />
                ) : (
                  <XCircle className="w-5 h-5 text-error" />
                )}
                <div className="flex-1">
                  <span className="font-medium">{result.correctGame.name}</span>
                  {result.userGuess && !result.isCorrect && (
                    <span className="text-sm text-muted-foreground ml-2">
                      (guessed: {result.userGuess})
                    </span>
                  )}
                </div>
                <div className="text-right">
                  {result.isCorrect && result.scoreEarned > 0 ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-success font-bold">
                        +{result.scoreEarned}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          50 pts × {calculateSpeedMultiplier(result.timeTakenMs).toFixed(1)}x {t('game.speed.label')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      +{result.scoreEarned}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}

            {guessResults.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                {t('game.noResults')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
