import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { GameErrorState } from '@/components/game/GameErrorState'
import { GamePlayScreen } from '@/components/game/GamePlayScreen'
import { TodayStart } from '@/components/today/TodayStart'
import { TodayDone } from '@/components/today/TodayDone'
import { useDailyGame } from '@/hooks/useDailyGame'
import { useOnline } from '@/hooks/useOnline'

function useCurrentStreak(userId: string | undefined, isGuest: boolean): number | null {
  const [streak, setStreak] = useState<number | null>(null)
  useEffect(() => {
    if (!userId || isGuest) return
    const ctrl = new AbortController()
    fetch('/api/user/me', { credentials: 'include', signal: ctrl.signal })
      .then((res) => res.json() as Promise<{ success: boolean; data?: { currentStreak?: number } }>)
      .then((json) => {
        if (json.success) setStreak(json.data?.currentStreak ?? 0)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [userId, isGuest])
  return userId && !isGuest ? streak : null
}

export default function TodayPage() {
  const { t } = useTranslation()
  const isOnline = useOnline()
  const {
    error,
    alreadyCompleted,
    isLoading,
    _hasHydrated,
    gamePhase,
    session,
    isKeyboardOpen,
    keyboardHeight,
    timeRemaining,
    todayDateString,
    challengeDate,
    totalScreenshots,
    currentScreenshotData,
    currentImageUrl,
    handleStartGame,
  } = useDailyGame()

  const isGuest = Boolean((session?.user as { isAnonymous?: boolean } | undefined)?.isAnonymous)
  const streak = useCurrentStreak(session?.user?.id, isGuest)
  const isDone = alreadyCompleted || gamePhase === 'challenge_complete'
  const isPlaying = gamePhase === 'playing' || gamePhase === 'result'

  if (isDone) {
    return <TodayDone isGuest={isGuest} streak={streak} />
  }

  return (
    <div
      className="relative h-[var(--page-h)] w-full overflow-hidden bg-background"
      style={{ paddingBottom: isKeyboardOpen ? keyboardHeight : 0 }}
    >
      <AnimatePresence mode="wait">
        {(isLoading || !_hasHydrated) && gamePhase === 'idle' && (
          <div key="loading" role="status" className="flex size-full items-center justify-center">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">{t('common.loading')}</span>
          </div>
        )}

        {error && !isPlaying && (
          <GameErrorState
            key="error"
            error={error}
            timeRemaining={timeRemaining}
            hasSession={Boolean(session?.user?.id)}
          />
        )}

        {gamePhase === 'daily_intro' && !error && (
          <TodayStart
            key="today-start"
            date={challengeDate || todayDateString}
            totalScreenshots={totalScreenshots}
            isAuthenticated={Boolean(session?.user?.id) && !isGuest}
            isOnline={isOnline}
            isStarting={isLoading}
            streak={streak}
            onStart={handleStartGame}
          />
        )}

        {isPlaying && (
          <GamePlayScreen
            key="game"
            showResult={gamePhase === 'result'}
            currentImageUrl={currentImageUrl}
            currentScreenshotId={currentScreenshotData?.screenshotId}
            isAuthenticated={!!session?.user?.id}
            isKeyboardOpen={isKeyboardOpen}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
