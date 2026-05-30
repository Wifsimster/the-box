import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGameStore } from '@/stores/gameStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { notifyAchievementsUnlocked } from '@/lib/achievementToasts'
import { Trophy, Home, CheckCircle, XCircle, Award, Clock, Loader2 } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { usePercentileRank } from '@/hooks/usePercentileRank'
import { PercentileBanner } from '@/components/game/PercentileBanner'
import { ShareCard } from '@/components/game/ShareCard'
import { GuessAttemptsList } from '@/components/game/GuessAttemptsList'
import { calculateSpeedMultiplier, formatDiscoveryTime } from '@/lib/utils'
import { useEffect, useState, useMemo } from 'react'
import { gameApi } from '@/lib/api/game'
import type { GuessResult, GuessAttempt, GameSessionDetailsResponse } from '@/types'

export default function ResultsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const {
    totalScore: backendTotalScore,
    totalScreenshots,
    guessResults,
    challengeDate,
    sessionId,
    updatePersonalBests
  } = useGameStore()

  const {
    notifications,
    markNotificationAsSeen,
    clearNotifications
  } = useAchievementStore()

  const unseenNotifications = notifications.filter(n => !n.seen)

  // Surface achievement toasts. The /notifications socket usually shows
  // these the instant the unlock lands; notifyAchievementsUnlocked
  // de-duplicates by key, so this render is a fallback for a missed socket
  // push rather than a second toast.
  useEffect(() => {
    if (unseenNotifications.length === 0) return
    notifyAchievementsUnlocked(unseenNotifications.map(n => n.achievement))
    unseenNotifications.forEach(n => markNotificationAsSeen(n.achievement.key))
  }, [unseenNotifications, markNotificationAsSeen])

  // The per-position attempt chips are sourced from the backend session
  // record — the authoritative log of every guess — rather than the
  // client-side store, whose positionAttempts map can carry guesses across
  // sessions. Falls back to the store's guessResults if the fetch fails
  // (e.g. mock API mode).
  const [sessionDetails, setSessionDetails] = useState<GameSessionDetailsResponse | null>(null)
  const [detailsFailed, setDetailsFailed] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    gameApi.getGameSessionDetails(sessionId)
      .then(data => { if (!cancelled) setSessionDetails(data) })
      .catch(() => { if (!cancelled) setDetailsFailed(true) })
    return () => { cancelled = true }
  }, [sessionId])

  const results = useMemo<GuessResult[]>(() => {
    if (!sessionDetails) return guessResults
    const merged: GuessResult[] = [
      ...sessionDetails.guesses.map(g => ({
        position: g.position,
        isCorrect: g.isCorrect,
        correctGame: g.correctGame,
        userGuess: g.userGuess,
        timeTakenMs: g.timeTakenMs,
        scoreEarned: g.scoreEarned,
        hintPenalty: g.hintPenalty,
        wrongGuessPenalty: g.wrongGuessPenalty,
        screenshot: g.screenshot,
        attempts: g.attempts ?? [],
      })),
      ...sessionDetails.unfoundGames.map(u => ({
        position: u.position,
        isCorrect: false,
        correctGame: u.game,
        userGuess: null,
        timeTakenMs: 0,
        scoreEarned: -50,
        screenshot: u.screenshot,
        attempts: [] as GuessAttempt[],
      })),
    ]
    return merged.sort((a, b) => a.position - b.position)
  }, [sessionDetails, guessResults])

  // Hold the results list back while the authoritative record loads rather
  // than flash the store data, which may show attempts from earlier runs.
  const detailsLoading = Boolean(sessionId) && !sessionDetails && !detailsFailed

  // Calculate correct answers from guess results (more reliable than store)
  const correctAnswers = results.filter(r => r.isCorrect).length

  // Use backend score directly (source of truth - includes wrong guess penalties)
  const displayTotalScore = backendTotalScore

  const accuracy = totalScreenshots > 0 ? Math.round((correctAnswers / totalScreenshots) * 100) : 0

  // Fetch percentile ranking (use calculated score for ranking)
  const { percentile, rank, totalPlayers, isLoading: isLoadingPercentile } = usePercentileRank(
    displayTotalScore,
    displayTotalScore > 0
  )

  // Update personal bests when results are loaded
  useEffect(() => {
    if (displayTotalScore > 0 && percentile !== undefined && percentile !== null) {
      updatePersonalBests(displayTotalScore, percentile)
    }
  }, [displayTotalScore, percentile, updatePersonalBests])

  // Clear achievement notifications when leaving page
  useEffect(() => {
    return () => {
      clearNotifications()
    }
  }, [clearNotifications])

  return (
    <>
      {/* Achievement notifications render through sonner toasts — see useEffect above */}
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
            className="inline-flex items-center justify-center size-16 sm:size-20 mb-3 sm:mb-4 rounded-full bg-linear-to-br from-neon-purple to-neon-pink shadow-lg shadow-neon-purple/30"
          >
            <Trophy className="size-8 sm:size-10 text-white" />
          </motion.div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-3 gradient-gaming bg-clip-text text-transparent">{t('game.tierComplete')}</h1>

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
          <ShareCard
            score={displayTotalScore}
            correctAnswers={correctAnswers}
            totalScreenshots={totalScreenshots}
            percentile={percentile ?? undefined}
            rank={rank ?? undefined}
            totalPlayers={totalPlayers ?? undefined}
            challengeDate={challengeDate || undefined}
            guessResults={guessResults}
          />
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => navigate(localizedPath('/'))}
          >
            <Home className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('common.home')}</span>
            <span className="sm:hidden">{t('common.home')}</span>
          </Button>
          <Button
            variant="gaming"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => navigate(localizedPath('/leaderboard'))}
          >
            <Award className="size-4 sm:mr-2" />
            {t('common.leaderboard')}
          </Button>
        </div>

        {/* Results Summary */}
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
              <h3 className="font-semibold text-base sm:text-lg">{t('game.resultsSummary')}</h3>
              <ShareCard
                score={displayTotalScore}
                correctAnswers={correctAnswers}
                totalScreenshots={totalScreenshots}
                percentile={percentile ?? undefined}
                rank={rank ?? undefined}
                totalPlayers={totalPlayers ?? undefined}
                challengeDate={challengeDate || undefined}
                guessResults={results}
                compact={true}
              />
            </div>
            {detailsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
              </div>
            ) : (
              <>
            {/* ScrollArea only on mobile, full list on desktop */}
            <div className="md:hidden">
              <ScrollArea className="h-[calc(100vh-500px)]">
                <div className="space-y-2 pr-2">
                  {/* Show all results including unguessed games */}
                  {results.map((result, index) => {
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
                            <CheckCircle className="size-4 sm:size-5 text-success shrink-0" />
                          ) : (
                            <XCircle className="size-4 sm:size-5 text-error shrink-0" />
                          )}
                          {/* Show screenshot thumbnail for unguessed games */}
                          {isUnguessed && result.screenshot && (
                            <div className="size-12 sm:size-16 rounded overflow-hidden shrink-0">
                              <img
                                src={result.screenshot.thumbnailUrl || result.screenshot.imageUrl}
                                alt="Screenshot"
                                className="size-full object-cover"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm sm:text-base block truncate">{result.correctGame.name}</span>
                            {isUnguessed && (!result.attempts || result.attempts.length === 0) && (
                              <span className="text-xs sm:text-sm text-destructive block mt-0.5">
                                {t('game.notFound') || 'Not Found'}
                              </span>
                            )}
                            {result.attempts && result.attempts.length > 0 && (
                              <>
                                <span className="text-xs text-muted-foreground block mt-0.5">
                                  {t('game.attempts.count', { count: result.attempts.length })}
                                </span>
                                <GuessAttemptsList attempts={result.attempts} compact />
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end sm:text-right gap-2 sm:gap-0">
                          {result.isCorrect && result.scoreEarned > 0 ? (
                            <div className="flex flex-col items-end gap-1">
                              <Badge variant="success" className="text-xs sm:text-sm font-bold">
                                +{result.scoreEarned}
                              </Badge>
                              {result.timeTakenMs > 0 && (() => {
                                const multiplier = calculateSpeedMultiplier(result.timeTakenMs)
                                return (
                                  <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground">
                                    <Clock className="size-3 sm:size-3.5" />
                                    <span className="whitespace-nowrap">
                                      {t('game.discoveryTime', { time: formatDiscoveryTime(result.timeTakenMs) })}
                                      {multiplier > 1.0 && (
                                        <> · {multiplier.toFixed(1)}x</>
                                      )}
                                    </span>
                                  </div>
                                )
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

                  {results.length === 0 && totalScreenshots === 0 && (
                    <p className="text-center text-muted-foreground py-6 sm:py-8 text-sm sm:text-base">
                      {t('game.noResults')}
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
            {/* Full list on desktop - no scroll */}
            <div className="hidden md:block">
              <div className="space-y-3">{results.map((result, index) => {
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
                        <CheckCircle className="size-5 text-success shrink-0" />
                      ) : (
                        <XCircle className="size-5 text-error shrink-0" />
                      )}
                      {/* Show screenshot thumbnail for unguessed games */}
                      {isUnguessed && result.screenshot && (
                        <div className="size-16 rounded overflow-hidden shrink-0">
                          <img
                            src={result.screenshot.thumbnailUrl || result.screenshot.imageUrl}
                            alt="Screenshot"
                            className="size-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-base block truncate">{result.correctGame.name}</span>
                        {isUnguessed && (!result.attempts || result.attempts.length === 0) && (
                          <span className="text-sm text-destructive block mt-0.5">
                            {t('game.notFound') || 'Not Found'}
                          </span>
                        )}
                        {result.attempts && result.attempts.length > 0 && (
                          <>
                            <span className="text-xs text-muted-foreground block mt-0.5">
                              {t('game.attempts.count', { count: result.attempts.length })}
                            </span>
                            <GuessAttemptsList attempts={result.attempts} />
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {result.isCorrect && result.scoreEarned > 0 ? (
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="success" className="text-sm font-bold">
                            +{result.scoreEarned}
                          </Badge>
                          {result.timeTakenMs > 0 && (() => {
                            const multiplier = calculateSpeedMultiplier(result.timeTakenMs)
                            return (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock className="size-3.5" />
                                <span className="whitespace-nowrap">
                                  {t('game.discoveryTime', { time: formatDiscoveryTime(result.timeTakenMs) })}
                                  {multiplier > 1.0 && (
                                    <> · {multiplier.toFixed(1)}x</>
                                  )}
                                </span>
                              </div>
                            )
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

                {results.length === 0 && totalScreenshots === 0 && (
                  <p className="text-center text-muted-foreground py-8 text-base">
                    {t('game.noResults')}
                  </p>
                )}
              </div>
            </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
