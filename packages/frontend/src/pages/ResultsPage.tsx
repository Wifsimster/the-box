import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGameStore } from '@/stores/gameStore'
import { Trophy, Home, CheckCircle, XCircle, Award, Clock } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { usePercentileRank } from '@/hooks/usePercentileRank'
import { PercentileBanner } from '@/components/game/PercentileBanner'
import { calculateSpeedMultiplier } from '@/lib/utils'

const UNFOUND_PENALTY = 50

export default function ResultsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { totalScore: backendTotalScore, totalScreenshots, guessResults, resetGame } = useGameStore()

  // Calculate correct answers from guess results (more reliable than store)
  const correctAnswers = guessResults.filter(r => r.isCorrect).length

  // Calculate total score from individual results (more reliable than backend total)
  const totalScoreFromResults = guessResults.reduce((sum, result) => sum + result.scoreEarned, 0)
  
  // Calculate unguessed positions and total penalty
  const unguessedCount = totalScreenshots - guessResults.length
  const totalPenalty = unguessedCount * UNFOUND_PENALTY
  
  // Final score is sum of individual scores minus penalties
  const calculatedTotalScore = Math.max(0, totalScoreFromResults - totalPenalty)
  
  // Use calculated score for display, but fallback to backend score if no results
  const displayTotalScore = guessResults.length > 0 ? calculatedTotalScore : backendTotalScore

  const accuracy = totalScreenshots > 0 ? Math.round((correctAnswers / totalScreenshots) * 100) : 0

  // Fetch percentile ranking (use calculated score for ranking)
  const { percentile, rank, totalPlayers, isLoading: isLoadingPercentile } = usePercentileRank(
    displayTotalScore,
    displayTotalScore > 0
  )

  const handlePlayAgain = () => {
    resetGame()
    navigate(localizedPath('/play'))
  }

  return (
    <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-4 sm:mb-6 md:mb-8"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
          className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 mb-3 sm:mb-4 rounded-full bg-linear-to-br from-neon-purple to-neon-pink shadow-lg shadow-neon-purple/30"
        >
          <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
        </motion.div>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-3 bg-linear-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent">{t('game.tierComplete')}</h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-primary mb-3 sm:mb-4"
        >
          {displayTotalScore} pts
        </motion.div>

        <div className="flex justify-center gap-4 sm:gap-6 md:gap-8 text-muted-foreground">
          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-1">
              <span className="text-foreground font-bold text-lg sm:text-xl md:text-2xl">{correctAnswers}</span>
              <span className="text-xs sm:text-sm">/{totalScreenshots}</span>
            </div>
            <p className="text-xs sm:text-sm mt-1">{t('game.correctAnswers')}</p>
          </div>
          <Separator orientation="vertical" className="h-8 sm:h-10 md:h-12" />
          <div className="flex flex-col items-center">
            <span className="text-foreground font-bold text-lg sm:text-xl md:text-2xl">{accuracy}%</span>
            <p className="text-xs sm:text-sm mt-1">{t('game.accuracy')}</p>
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
      <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
        <Button 
          variant="outline" 
          size="lg" 
          className="w-full sm:w-auto"
          onClick={() => navigate(localizedPath('/'))}
        >
          <Home className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">{t('common.home')}</span>
          <span className="sm:hidden">{t('common.home')}</span>
        </Button>
        <Button 
          variant="gaming" 
          size="lg" 
          className="w-full sm:w-auto"
          onClick={() => navigate(localizedPath('/leaderboard'))}
        >
          <Award className="w-4 h-4 sm:mr-2" />
          {t('common.leaderboard')}
        </Button>
      </div>

      {/* Results Summary */}
      <Card className="bg-card/50 border-border">
        <CardContent className="pt-4 sm:pt-6">
          <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">{t('game.resultsSummary')}</h3>
          {/* ScrollArea only on mobile, full list on desktop */}
          <div className="md:hidden">
            <ScrollArea className="h-[calc(100vh-500px)]">
              <div className="space-y-2 pr-2">
              {/* Show only guessed positions */}
              {guessResults.map((result, index) => (
                <motion.div
                  key={result.position}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-secondary/50"
                >
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <span className="text-muted-foreground text-sm sm:text-base w-5 sm:w-6 shrink-0">{result.position}.</span>
                    {result.isCorrect ? (
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-success shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-error shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm sm:text-base block truncate">{result.correctGame.name}</span>
                      {result.userGuess && !result.isCorrect && (
                        <span className="text-xs sm:text-sm text-muted-foreground block sm:inline sm:ml-2 mt-0.5 sm:mt-0">
                          (guessed: {result.userGuess})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end sm:text-right gap-2 sm:gap-0">
                    {result.isCorrect && result.scoreEarned > 0 ? (
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="success" className="text-xs sm:text-sm font-bold">
                          +{result.scoreEarned}
                        </Badge>
                        {(() => {
                          const multiplier = calculateSpeedMultiplier(result.timeTakenMs)
                          if (multiplier > 1.0) {
                            return (
                              <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                <span className="whitespace-nowrap">
                                  50 pts × {multiplier.toFixed(1)}x {t('game.speed.label')}
                                </span>
                              </div>
                            )
                          }
                          return null
                        })()}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs sm:text-sm">
                        +{result.scoreEarned}
                      </Badge>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Show total penalty for unguessed games in red */}
              {unguessedCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: guessResults.length * 0.05 + 0.1 }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-destructive/10 border border-destructive/20 mt-3 sm:mt-4"
                >
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-error shrink-0" />
                    <span className="font-medium text-muted-foreground text-sm sm:text-base">
                      {unguessedCount === 1 
                        ? t('game.unguessedGame', { count: unguessedCount })
                        : t('game.unguessedGames', { count: unguessedCount })
                      }
                    </span>
                  </div>
                  <div className="text-right sm:text-left">
                    <Badge variant="destructive" className="text-sm sm:text-base font-bold">
                      -{totalPenalty}
                    </Badge>
                  </div>
                </motion.div>
              )}

              {guessResults.length === 0 && totalScreenshots === 0 && (
                <p className="text-center text-muted-foreground py-6 sm:py-8 text-sm sm:text-base">
                  {t('game.noResults')}
                </p>
              )}
              </div>
            </ScrollArea>
          </div>
          {/* Full list on desktop - no scroll */}
          <div className="hidden md:block">
            <div className="space-y-3">
              {/* Show only guessed positions */}
              {guessResults.map((result, index) => (
                <motion.div
                  key={result.position}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-muted-foreground text-base w-6 shrink-0">{result.position}.</span>
                    {result.isCorrect ? (
                      <CheckCircle className="w-5 h-5 text-success shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-error shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-base block truncate">{result.correctGame.name}</span>
                      {result.userGuess && !result.isCorrect && (
                        <span className="text-sm text-muted-foreground inline ml-2">
                          (guessed: {result.userGuess})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end text-right gap-0">
                    {result.isCorrect && result.scoreEarned > 0 ? (
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="success" className="text-sm font-bold">
                          +{result.scoreEarned}
                        </Badge>
                        {(() => {
                          const multiplier = calculateSpeedMultiplier(result.timeTakenMs)
                          if (multiplier > 1.0) {
                            return (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock className="w-3.5 h-3.5" />
                                <span className="whitespace-nowrap">
                                  50 pts × {multiplier.toFixed(1)}x {t('game.speed.label')}
                                </span>
                              </div>
                            )
                          }
                          return null
                        })()}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-sm">
                        +{result.scoreEarned}
                      </Badge>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Show total penalty for unguessed games in red */}
              {unguessedCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: guessResults.length * 0.05 + 0.1 }}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 mt-4"
                >
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-error shrink-0" />
                    <span className="font-medium text-muted-foreground text-base">
                      {unguessedCount === 1 
                        ? t('game.unguessedGame', { count: unguessedCount })
                        : t('game.unguessedGames', { count: unguessedCount })
                      }
                    </span>
                  </div>
                  <div className="text-left">
                    <Badge variant="destructive" className="text-base font-bold">
                      -{totalPenalty}
                    </Badge>
                  </div>
                </motion.div>
              )}

              {guessResults.length === 0 && totalScreenshots === 0 && (
                <p className="text-center text-muted-foreground py-8 text-base">
                  {t('game.noResults')}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
