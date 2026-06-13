import { m, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { DailyIntro } from '@/components/game/TierIntro'
import { GameErrorState } from '@/components/game/GameErrorState'
import { ChallengeCompleteScreen } from '@/components/game/ChallengeCompleteScreen'
import { GamePlayScreen } from '@/components/game/GamePlayScreen'
import { GuestGateModal } from '@/components/onboarding/GuestGateModal'
import { useDailyGame } from '@/hooks/useDailyGame'

export default function GamePage() {
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
    guestGateOpen,
    handleStartGame,
    handleResetSession,
    handleGuestContinue,
    handleGuestCreateAccount,
  } = useDailyGame()

  return (
    <div
      className="relative w-full bg-background overflow-hidden h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)]"
      style={{
        // Reserve space for the on-screen keyboard. The value snaps with the
        // keyboard's own animation; we intentionally don't add a CSS
        // transition on padding-bottom — animating a layout property would
        // force a reflow every frame (layout thrash).
        paddingBottom: isKeyboardOpen ? keyboardHeight : 0,
      }}
    >
      <GuestGateModal
        open={guestGateOpen}
        onContinueAsGuest={handleGuestContinue}
        onCreateAccount={handleGuestCreateAccount}
      />
      <AnimatePresence mode="wait">
        {/* Loading State - also show while waiting for hydration */}
        {(isLoading || !_hasHydrated) && gamePhase === 'idle' && (
          <m.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center size-full"
          >
            <Loader2 className="size-8 animate-spin text-primary" />
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

        {/* Daily Challenge Intro Screen */}
        {gamePhase === 'daily_intro' && !error && (
          <DailyIntro
            key="daily-intro"
            date={challengeDate || todayDateString}
            totalScreenshots={totalScreenshots}
            onStart={handleStartGame}
            isCatchUp={isCatchUp}
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
