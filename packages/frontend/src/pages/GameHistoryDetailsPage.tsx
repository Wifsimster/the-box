import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trophy, ArrowLeft, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { gameApi } from '@/lib/api/game'
import type { GameSessionDetailsResponse } from '@/types'
import { calculateSpeedMultiplier } from '@/lib/utils'

const UNFOUND_PENALTY = 50

export default function GameHistoryDetailsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [sessionData, setSessionData] = useState<GameSessionDetailsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setError('Session ID is required')
      setLoading(false)
      return
    }

    gameApi.getGameSessionDetails(sessionId)
      .then(data => {
        setSessionData(data)
        setError(null)
      })
      .catch(err => {
        setError(err.message || 'Failed to load game session details')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [sessionId])

  if (loading) {
    return (
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 max-w-4xl">
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  if (error || !sessionData) {
    return (
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 max-w-4xl">
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">{error || 'Session not found'}</p>
          <Button onClick={() => navigate(localizedPath('/history'))}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.back')}
          </Button>
        </div>
      </div>
    )
  }

  // Calculate statistics and merge unfound games with guesses
  const allResults: Array<{
    position: number
    isCorrect: boolean
    correctGame: typeof sessionData.guesses[0]['correctGame']
    userGuess: string | null
    timeTakenMs: number
    scoreEarned: number
    hintPenalty?: number
    wrongGuessPenalty?: number
    tryNumber: number
    screenshot?: { thumbnailUrl?: string; imageUrl: string }
  }> = [...sessionData.guesses]

  // Add unfound games as unguessed entries
  if (sessionData.unfoundGames && sessionData.unfoundGames.length > 0) {
    const unfoundResults = sessionData.unfoundGames.map(unfound => ({
      position: unfound.position,
      isCorrect: false,
      correctGame: unfound.game,
      userGuess: null,
      timeTakenMs: 0,
      scoreEarned: -50,
      tryNumber: 0,
      screenshot: unfound.screenshot,
    }))
    allResults.push(...unfoundResults)
  }

  // Sort by position
  allResults.sort((a, b) => a.position - b.position)

  const correctAnswers = allResults.filter(g => g.isCorrect).length
  const accuracy = sessionData.totalScreenshots > 0
    ? Math.round((correctAnswers / sessionData.totalScreenshots) * 100)
    : 0

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString(i18n.language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
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

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-3 bg-linear-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent">
          {formatDate(sessionData.challengeDate)}
        </h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-primary mb-3 sm:mb-4"
        >
          {sessionData.totalScore} pts
        </motion.div>

        <div className="flex justify-center gap-4 sm:gap-6 md:gap-8 text-muted-foreground">
          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-1">
              <span className="text-foreground font-bold text-lg sm:text-xl md:text-2xl">{correctAnswers}</span>
              <span className="text-xs sm:text-sm">/{sessionData.totalScreenshots}</span>
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

      {/* Back Button */}
      <div className="flex justify-center mb-4 sm:mb-6 md:mb-8">
        <Button
          variant="outline"
          size="lg"
          onClick={() => navigate(localizedPath('/history'))}
        >
          <ArrowLeft className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">{t('common.back')}</span>
          <span className="sm:hidden">{t('common.back')}</span>
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
                {allResults.map((result: typeof allResults[0], index: number) => {
                  const isUnguessed = !result.isCorrect && result.userGuess === null && result.scoreEarned === -50
                  return (
                    <motion.div
                      key={result.position}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg ${isUnguessed ? 'bg-destructive/10 border border-destructive/20' : 'bg-secondary/50'
                        }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <span className="text-muted-foreground text-sm sm:text-base w-5 sm:w-6 shrink-0">{result.position}.</span>
                        {result.isCorrect ? (
                          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-success shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-error shrink-0" />
                        )}
                        {/* Show screenshot thumbnail for unguessed games */}
                        {isUnguessed && result.screenshot && (
                          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded overflow-hidden shrink-0">
                            <img
                              src={result.screenshot.thumbnailUrl || result.screenshot.imageUrl}
                              alt="Screenshot"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm sm:text-base block truncate">{result.correctGame.name}</span>
                          {result.userGuess && !result.isCorrect && (
                            <span className="text-xs sm:text-sm text-muted-foreground block sm:inline sm:ml-2 mt-0.5 sm:mt-0">
                              (guessed: {result.userGuess})
                            </span>
                          )}
                          {isUnguessed && (
                            <span className="text-xs sm:text-sm text-destructive block mt-0.5">
                              {t('game.notFound') || 'Not Found'}
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
                                      100 pts × {multiplier.toFixed(1)}x {t('game.speed.label')}
                                    </span>
                                  </div>
                                )
                              }
                              return null
                            })()}
                          </div>
                        ) : isUnguessed ? (
                          <Badge variant="destructive" className="text-xs sm:text-sm font-bold">
                            {result.scoreEarned}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs sm:text-sm">
                            +{result.scoreEarned}
                          </Badge>
                        )}
                      </div>
                    </motion.div>
                  )
                })}

                {allResults.length === 0 && sessionData.totalScreenshots === 0 && (
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
              {allResults.map((result: typeof allResults[0], index: number) => {
                const isUnguessed = !result.isCorrect && result.userGuess === null && result.scoreEarned === -50
                return (
                  <motion.div
                    key={result.position}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-lg ${isUnguessed ? 'bg-destructive/10 border border-destructive/20' : 'bg-secondary/50'
                      }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-muted-foreground text-base w-6 shrink-0">{result.position}.</span>
                      {result.isCorrect ? (
                        <CheckCircle className="w-5 h-5 text-success shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-error shrink-0" />
                      )}
                      {/* Show screenshot thumbnail for unguessed games */}
                      {isUnguessed && result.screenshot && (
                        <div className="w-16 h-16 rounded overflow-hidden shrink-0">
                          <img
                            src={result.screenshot.thumbnailUrl || result.screenshot.imageUrl}
                            alt="Screenshot"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-base block truncate">{result.correctGame.name}</span>
                        {result.userGuess && !result.isCorrect && (
                          <span className="text-sm text-muted-foreground inline ml-2">
                            (guessed: {result.userGuess})
                          </span>
                        )}
                        {isUnguessed && (
                          <span className="text-sm text-destructive block mt-0.5">
                            {t('game.notFound') || 'Not Found'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
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
                                    100 pts × {multiplier.toFixed(1)}x {t('game.speed.label')}
                                  </span>
                                </div>
                              )
                            }
                            return null
                          })()}
                        </div>
                      ) : isUnguessed ? (
                        <Badge variant="destructive" className="text-sm font-bold">
                          {result.scoreEarned}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-sm">
                          +{result.scoreEarned}
                        </Badge>
                      )}
                    </div>
                  </motion.div>
                )
              })}

              {allResults.length === 0 && sessionData.totalScreenshots === 0 && (
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
