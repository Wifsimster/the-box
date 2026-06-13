import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { notifyAchievementsUnlocked } from '@/lib/achievementToasts'
import { Home, Award } from 'lucide-react'
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
  const navigate = useNavigate()
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

  return (
    <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 max-w-4xl">
      {/* Achievement notifications render through sonner toasts — see useEffect above */}
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
          <>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => navigate(localizedPath('/'))}
            >
              <Home className="size-4 sm:mr-2" />
              <span>{t('common.home')}</span>
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
          </>
        }
      />
    </div>
  )
}
