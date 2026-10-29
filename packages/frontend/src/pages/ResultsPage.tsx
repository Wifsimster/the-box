import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { notifyAchievementsUnlocked } from '@/lib/achievementToasts'
import { CalendarCheck, Award, Play, Inbox } from 'lucide-react'
import { GuestSaveCard } from '@/components/today/GuestSaveCard'
import { useSession } from '@/lib/auth-client'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { usePercentileRank } from '@/hooks/usePercentileRank'
import { SessionDetails } from '@/components/game/SessionDetails'
import { mergeSessionResults, resolveResultsSummary } from '@/lib/sessionResults'
import { useEffect, useState, useMemo } from 'react'
import { gameApi } from '@/lib/api/game'
import type { GuessResult, GameSessionDetailsResponse } from '@/types'

export default function ResultsPage() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const reducedMotion = useReducedMotionSafe()
  const { data: authSession } = useSession()
  const isGuest = Boolean((authSession?.user as { isAnonymous?: boolean } | undefined)?.isAnonymous)
  const {
    totalScore: storeTotalScore,
    totalScreenshots: storeTotalScreenshots,
    guessResults,
    challengeDate: storeChallengeDate,
    sessionId,
    updateScore,
    updatePersonalBests
  } = useGameStore()

  const {
    notifications,
    markNotificationAsSeen,
    clearNotifications
  } = useAchievementStore()

  const unseenNotifications = notifications.filter(n => !n.seen)

  useEffect(() => {
    if (unseenNotifications.length === 0) return
    notifyAchievementsUnlocked(unseenNotifications.map(n => n.achievement))
    unseenNotifications.forEach(n => markNotificationAsSeen(n.achievement.key))
  }, [unseenNotifications, markNotificationAsSeen])

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

  const summary = resolveResultsSummary(
    {
      sessionId,
      totalScore: storeTotalScore,
      totalScreenshots: storeTotalScreenshots,
      challengeDate: storeChallengeDate,
    },
    sessionDetails,
  )
  const displayTotalScore = summary.totalScore

  const results = useMemo<GuessResult[]>(
    () => (summary.authoritative && sessionDetails ? mergeSessionResults(sessionDetails) : guessResults),
    [summary.authoritative, sessionDetails, guessResults],
  )

  useEffect(() => {
    if (summary.authoritative && storeTotalScore !== summary.totalScore) {
      updateScore(summary.totalScore)
    }
  }, [summary.authoritative, summary.totalScore, storeTotalScore, updateScore])

  const { percentile, rank, totalPlayers, isLoading: isLoadingPercentile } = usePercentileRank({
    sessionId,
    score: displayTotalScore,
    enabled: displayTotalScore > 0,
  })

  const scoreSettled = summary.authoritative || detailsFailed || !sessionId
  useEffect(() => {
    if (scoreSettled && displayTotalScore > 0 && percentile !== undefined && percentile !== null) {
      updatePersonalBests(displayTotalScore, percentile)
    }
  }, [scoreSettled, displayTotalScore, percentile, updatePersonalBests])

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
          <h1 className="text-sm sm:text-base font-normal text-muted-foreground">{t('game.noResults')}</h1>
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
      {isGuest && <GuestSaveCard rank={rank} totalPlayers={totalPlayers} className="mb-6" />}
      <SessionDetails
        results={results}
        totalScore={displayTotalScore}
        totalScreenshots={summary.totalScreenshots}
        challengeDate={summary.challengeDate || undefined}
        isPersonalBest={summary.authoritative && (sessionDetails?.isPersonalBest ?? false)}
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
                <CalendarCheck className="size-4" aria-hidden="true" />
                {t('common.today')}
              </Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}
