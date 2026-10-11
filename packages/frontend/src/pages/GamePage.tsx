import { m, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { TodayStart } from '@/components/today/TodayStart'
import { GameErrorState } from '@/components/game/GameErrorState'
import { ChallengeCompleteScreen } from '@/components/game/ChallengeCompleteScreen'
import { GamePlayScreen } from '@/components/game/GamePlayScreen'
import { useDailyGame } from '@/hooks/useDailyGame'
import { useOnline } from '@/hooks/useOnline'

/**
 * `/play`: the daily box outside the home route — catch-up of a past box
 * (`?date=`), old links and the verification harness. Today's box normally
 * lives on `/` (TodayPage); both share `useDailyGame` and the closed-box
 * screen (`TodayStart`).
 */
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
        // Reserve space for the on-screen keyboard. The value snaps with the
        // keyboard's own animation; we intentionally don't add a CSS
        // transition on padding-bottom — animating a layout property would
        // force a reflow every frame (layout thrash).
        paddingBottom: isKeyboardOpen ? keyboardHeight : 0,
      }}
    >
      <AnimatePresence mode="wait">
        {/* Loading State - also show while waiting for hydration */}
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

        {/* Error State */}
        {error && (
          <GameErrorState
            key="error"
            error={error}
            timeRemaining={timeRemaining}
            hasSession={Boolean(session?.user?.id)}
          />
        )}

        {/* The closed box: one tap opens it (no intro screen, no account gate) */}
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

        {/* Main Game Screen */}
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

        {/* Challenge Complete Screen */}
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
