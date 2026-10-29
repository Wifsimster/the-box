import { m, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { TodayStart } from '@/components/today/TodayStart'
import { GameErrorState } from '@/components/game/GameErrorState'
import { ChallengeCompleteScreen } from '@/components/game/ChallengeCompleteScreen'
import { GamePlayScreen } from '@/components/game/GamePlayScreen'
import { useDailyGame } from '@/hooks/useDailyGame'
import { useOnline } from '@/hooks/useOnline'

export default function GamePage() {
  const { t } = useTranslation()
  const isOnline = useOnline()
  const {
    error,
    isResetting,
    isLoading,
    _hasHydrated,
    gamePhase,
    session,
    isAdmin,
    isKeyboardOpen,
    keyboardHeight,
    timeRemaining,
    todayDateString,
    challengeDate,
    totalScreenshots,
    totalScore,
    guessResults,
    currentScreenshotData,
    currentImageUrl,
    worldScore,
    isCatchUp,
    handleStartGame,
    handleResetSession,
  } = useDailyGame()
  const isGuest = Boolean((session?.user as { isAnonymous?: boolean } | undefined)?.isAnonymous)

  return (
    <div
      className="relative w-full bg-background overflow-hidden h-[var(--page-h)]"
      style={{
        paddingBottom: isKeyboardOpen ? keyboardHeight : 0,
      }}
    >
      <AnimatePresence mode="wait">
        {(isLoading || !_hasHydrated) && gamePhase === 'idle' && (
          <m.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="status"
            className="flex items-center justify-center size-full"
          >
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">{t('common.loading')}</span>
          </m.div>
        )}

        {error && (
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
            isCatchUp={isCatchUp}
            onStart={handleStartGame}
          />
        )}

        {(gamePhase === 'playing' || gamePhase === 'result') && (
          <GamePlayScreen
            key="game"
            showResult={gamePhase === 'result'}
            currentImageUrl={currentImageUrl}
            currentScreenshotId={currentScreenshotData?.screenshotId}
            isAuthenticated={!!session?.user?.id}
            isKeyboardOpen={isKeyboardOpen}
          />
        )}

        {gamePhase === 'challenge_complete' && (
          <ChallengeCompleteScreen
            key="challenge-complete"
            totalScore={totalScore}
            guessResults={guessResults}
            worldScore={worldScore}
            isAdmin={isAdmin}
            isResetting={isResetting}
            onResetSession={handleResetSession}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
