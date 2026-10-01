import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { notifyAchievementsUnlocked } from '@/lib/achievementToasts'
import { Home, Award, Play, Inbox } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { usePercentileRank } from '@/hooks/usePercentileRank'
import { SessionDetails } from '@/components/game/SessionDetails'
import { mergeSessionResults } from '@/lib/sessionResults'
import { useEffect, useState, useMemo } from 'react'
import { gameApi } from '@/lib/api/game'
import type { GuessResult, GameSessionDetailsResponse } from '@/types'

export default function ResultsPage() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const reducedMotion = useReducedMotionSafe()
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

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    gameApi.getGameSessionDetails(sessionId)
      .then(data => { if (!cancelled) setSessionDetails(data) })
      .catch(() => { /* keep store fallback */ })
    return () => { cancelled = true }
  }, [sessionId])

  const results = useMemo<GuessResult[]>(
    () => (sessionDetails ? mergeSessionResults(sessionDetails) : guessResults),
    [sessionDetails, guessResults],
  )

  // Use backend score directly (source of truth - includes wrong guess penalties)
  const displayTotalScore = backendTotalScore

  // Fetch percentile ranking (use backend score for ranking)
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

  if (!sessionId && results.length === 0) {
    return (
      <div className="container mx-auto flex min-h-[var(--page-h)] max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="m-auto flex flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
            <Inbox className="size-7" />
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">{t('game.noResults')}</p>
          <Button variant="gaming" size="lg" asChild className="w-full sm:w-auto">
            <Link to={localizedPath('/play')}>
              <Play className="size-4" aria-hidden="true" />
              {t('home.playToday')}
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 md:py-12 lg:px-8">
      <SessionDetails
        results={results}
        totalScore={displayTotalScore}
        totalScreenshots={totalScreenshots}
        challengeDate={challengeDate || undefined}
        isPersonalBest={sessionDetails?.isPersonalBest ?? false}
        heroTitle={t('game.tierComplete')}
        percentile={percentile}
        rank={rank}
        totalPlayers={totalPlayers}
        isLoadingPercentile={isLoadingPercentile}
        shareEnabled
        reducedMotion={reducedMotion}
        actions={
          <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
            <Button variant="outline" size="lg" asChild className="w-full px-4 sm:w-auto sm:px-8">
              <Link to={localizedPath('/leaderboard')}>
                <Award className="size-4" aria-hidden="true" />
                {t('common.leaderboard')}
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="w-full px-4 sm:w-auto sm:px-8">
              <Link to={localizedPath('/')}>
                <Home className="size-4" aria-hidden="true" />
                {t('common.home')}
              </Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}
