import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useGameStore } from '@/stores/gameStore'
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'
import { DailyIntro } from '@/components/game/TierIntro'
import { ScreenshotViewer } from '@/components/game/ScreenshotViewer'
import { GuessInput } from '@/components/game/GuessInput'
import { HintButtons } from '@/components/game/HintButtons'
import { SecondChanceModal } from '@/components/game/SecondChanceModal'
import { ScoreDisplay } from '@/components/game/ScoreDisplay'
import { ResultCard } from '@/components/game/ResultCard'
import { CompletionChoiceModal } from '@/components/game/CompletionChoiceModal'
import { ProgressDots } from '@/components/game/ProgressDots'
import { EndGameButton } from '@/components/game/EndGameButton'
import { ReportCaptureDialog } from '@/components/ReportCaptureDialog'
import { Button } from '@/components/ui/button'
import { Clock, Globe, Home, Loader2, Trophy, RotateCcw, History, CheckCircle2 } from 'lucide-react'
import { adminApi } from '@/lib/api/admin'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useNextDailyCountdown } from '@/hooks/useNextDailyCountdown'
import { useWorldScore } from '@/hooks/useWorldScore'
import { createLeaderboardService } from '@/services'
import { gameApi } from '@/lib/api'
import { authClient, useSession } from '@/lib/auth-client'
import { GuestGateModal } from '@/components/onboarding/GuestGateModal'

const GUEST_OPT_IN_KEY = 'theBox.guestOptIn'

export default function GamePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const [searchParams] = useSearchParams()
  const { data: session, isPending: isSessionPending } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [isResetting, setIsResetting] = useState(false)
  const [guestGateOpen, setGuestGateOpen] = useState(false)
  const isAdmin = session?.user?.role === 'admin'

  // iOS Safari fallback: when the keyboard overlays the layout viewport we lift
  // the whole game by keyboardHeight. Android Chrome honors
  // `interactive-widget=resizes-content` on the viewport meta, which already
  // shrinks the layout viewport — the hook reports ~0 there, so this is a no-op.
  const { isKeyboardOpen, keyboardHeight } = useKeyboardHeight()
  const timeRemaining = useNextDailyCountdown()

  // Get date from query params if provided
  const challengeDateParam = searchParams.get('date')
  const {
    _hasHydrated,
    gamePhase,
    challengeId,
    challengeDate,
    sessionId,
    currentPosition,
    totalScreenshots,
    totalScore,
    currentScreenshotData,
    isLoading,
    guessResults,
    setGamePhase,
    setChallengeId,
    setSessionId,
    setScreenshotData,
    setLoading,
    initializePositionStates,
    restoreSessionState,
  } = useGameStore()

  // Service for leaderboard operations
  const leaderboardService = useMemo(() => createLeaderboardService(), [])

  // Determine if this is a catch-up session (playing a previous day's challenge)
  const isCatchUp = useMemo(() => {
    if (!challengeDate) return false
    const today = new Date().toISOString().split('T')[0]
    return challengeDate !== today
  }, [challengeDate])

  // Fetch world total score when challenge is complete
  const { worldScore } = useWorldScore(
    leaderboardService,
    gamePhase === 'challenge_complete'
  )

  // Redirect to results page when challenge is complete
  useEffect(() => {
    if (gamePhase === 'challenge_complete') {
      // Navigate directly to results without delay
      navigate(localizedPath('/results'))
    }
  }, [gamePhase, navigate, localizedPath])

  // Pre-fetch all screenshots when game starts
  const prefetchAllScreenshots = useCallback(async (sid: string, totalScreenshots: number) => {
    if (!sid) return

    // Pre-fetch all screenshots in parallel (but limit concurrency to avoid overwhelming the server)
    const positions = Array.from({ length: totalScreenshots }, (_, i) => i + 1)

    // Process in batches of 3 to avoid overwhelming the server
    const batchSize = 3
    for (let i = 0; i < positions.length; i += batchSize) {
      const batch = positions.slice(i, i + batchSize)
      await Promise.allSettled(
        batch.map(async (position) => {
          try {
            const data = await gameApi.getScreenshot(sid, position, { prefetch: true })
            // Preload the image in browser cache
            const img = new Image()
            img.src = data.imageUrl
          } catch {
            // Silently fail - pre-fetching is optional
          }
        })
      )
    }
  }, [])

  // Reset game session when the URL date param changes (e.g. switching from today to catch-up)
  // This ensures stale session state doesn't prevent loading a different challenge
  useEffect(() => {
    if (!_hasHydrated) return
    const storeDate = useGameStore.getState().challengeDate
    const targetDate = challengeDateParam || null

    // If we have a URL date that differs from the store, or if the store has a stale
    // catch-up date but we're navigating to today (no date param), reset the session
    if (targetDate && storeDate && targetDate !== storeDate) {
      useGameStore.getState().resetGameSession()
    } else if (!targetDate && storeDate) {
      const today = new Date().toISOString().split('T')[0]
      if (storeDate !== today && gamePhase !== 'idle') {
        useGameStore.getState().resetGameSession()
      }
    }
  }, [_hasHydrated, challengeDateParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch today's challenge on mount (after hydration completes)
  useEffect(() => {
    // Wait for Zustand to hydrate from localStorage before fetching
    // This ensures persisted state (positionStates, currentPosition) is available
    if (!_hasHydrated) return

    const fetchChallenge = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await gameApi.getTodayChallenge(challengeDateParam || undefined)

        // Always update the challenge date to show the correct date
        useGameStore.setState({ challengeDate: data.date })

        // Check if a challenge exists for this date
        if (!data.challengeId) {
          setError(t('game.noChallengeAvailable', { date: data.date }))
          setLoading(false)
          return
        }

        setChallengeId(data.challengeId, data.date)
        // Store total screenshots from challenge
        useGameStore.setState({ totalScreenshots: data.totalScreenshots })

        // If user has an existing session
        if (data.userSession) {
          // Check if it's already completed
          if (data.userSession.isCompleted) {
            setGamePhase('daily_intro')
            setError(t('game.alreadyCompleted'))
            setLoading(false)
            return
          }

          // Resume incomplete session
          setSessionId(data.userSession.sessionId, data.userSession.tierSessionId)

          // Restore full session state from backend (merges with persisted local state)
          restoreSessionState({
            challengeId: data.challengeId,
            correctPositions: data.userSession.correctPositions,
            currentPosition: data.userSession.currentPosition,
            totalScreenshots: data.totalScreenshots,
            screenshotsFound: data.userSession.screenshotsFound,
            totalScore: data.userSession.totalScore,
          })

          // Get the restored position (may be from localStorage, not backend)
          const restoredPosition = useGameStore.getState().currentPosition

          // Fetch screenshot for restored position and go directly to playing
          const screenshotData = await gameApi.getScreenshot(
            data.userSession.sessionId,
            restoredPosition
          )
          setScreenshotData(screenshotData)
          setGamePhase('playing')
          setLoading(false)

          // Pre-fetch all remaining screenshots in the background for smooth swiping
          // Don't await - let it run in the background
          prefetchAllScreenshots(data.userSession.sessionId, data.totalScreenshots).catch(() => {
            // Silently fail - pre-fetching is optional
          })
          return
        }

        setGamePhase('daily_intro')
      } catch (err) {
        console.error('Failed to fetch challenge:', err)
        setError(t('game.errorLoadingChallenge'))
      } finally {
        setLoading(false)
      }
    }

    if (gamePhase === 'idle') {
      fetchChallenge()
    }
  }, [_hasHydrated, gamePhase, challengeDateParam, setGamePhase, setChallengeId, setSessionId, setScreenshotData, setLoading, restoreSessionState, prefetchAllScreenshots, t])

  // Fetch screenshot when position changes or game starts
  const fetchScreenshot = useCallback(async (sid: string, position: number) => {
    try {
      setLoading(true)
      const data = await gameApi.getScreenshot(sid, position)
      setScreenshotData(data)
    } catch (err) {
      console.error('Failed to fetch screenshot:', err)
      setError(t('game.errorLoadingScreenshot'))
    } finally {
      setLoading(false)
    }
  }, [setScreenshotData, setLoading, t])

  // Pre-fetch adjacent screenshots for smooth swiping
  const prefetchAdjacentScreenshots = useCallback(async (sid: string, currentPos: number) => {
    if (!sid || gamePhase !== 'playing') return

    const { positionStates, totalScreenshots } = useGameStore.getState()

    // Find next navigable position
    const findNextPosition = () => {
      for (let i = currentPos + 1; i <= totalScreenshots; i++) {
        const state = positionStates[i]
        if (!state || state.status === 'not_visited' || state.status === 'skipped' || state.status === 'correct') {
          return i
        }
      }
      // Check for skipped/correct positions from beginning (wrap around)
      for (let i = 1; i < currentPos; i++) {
        const state = positionStates[i]
        if (state?.status === 'skipped' || state?.status === 'correct') {
          return i
        }
      }
      return null
    }

    // Find previous navigable position
    const findPreviousPosition = () => {
      for (let i = currentPos - 1; i >= 1; i--) {
        const state = positionStates[i]
        if (state?.status === 'skipped' || state?.status === 'not_visited' || state?.status === 'correct') {
          return i
        }
      }
      // Check for skipped/correct positions from end (wrap around)
      for (let i = totalScreenshots; i > currentPos; i--) {
        const state = positionStates[i]
        if (state?.status === 'skipped' || state?.status === 'correct') {
          return i
        }
      }
      return null
    }

    const nextPos = findNextPosition()
    const prevPos = findPreviousPosition()

    // Pre-fetch next screenshot
    if (nextPos) {
      try {
        const nextData = await gameApi.getScreenshot(sid, nextPos, { prefetch: true })
        // Preload the image in browser cache
        const img = new Image()
        img.src = nextData.imageUrl
      } catch {
        // Silently fail - pre-fetching is optional
      }
    }

    // Pre-fetch previous screenshot
    if (prevPos) {
      try {
        const prevData = await gameApi.getScreenshot(sid, prevPos, { prefetch: true })
        // Preload the image in browser cache
        const img = new Image()
        img.src = prevData.imageUrl
      } catch {
        // Silently fail - pre-fetching is optional
      }
    }
  }, [gamePhase])

  // Handle starting the game
  const handleStartGame = useCallback(async () => {
    if (!challengeId) {
      setError(t('game.noChallenge'))
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Reset relevant game state to ensure clean slate for new game
      // This clears any persisted state from previously completed games.
      // positionAttempts is keyed by position number (1..10) and is the
      // source of the per-guess `attempts` snapshot in addGuessResult, so
      // missing it here let yesterday's wrong tries bleed into today's
      // results page.
      useGameStore.setState({
        totalScore: 0,
        correctAnswers: 0,
        guessResults: [],
        positionAttempts: {},
        lastResult: null,
        screenshotsFound: 0,
      })

      // Unauthenticated? Show the Create-Account gate unless the user already
      // opted into guest play in this tab. This replaces the previous silent
      // anonymous sign-in, which was killing signup conversion.
      if (!session && !isSessionPending) {
        const optedIn = sessionStorage.getItem(GUEST_OPT_IN_KEY) === '1'
        if (!optedIn) {
          setGuestGateOpen(true)
          setLoading(false)
          return
        }

        const signInResult = await authClient.signIn.anonymous()
        if (signInResult.error) {
          console.error('Failed to sign in as guest:', signInResult.error)
          setError(t('game.errorStarting'))
          setLoading(false)
          return
        }

        // Wait a moment for the session cookie to be set
        // Better-auth sets cookies immediately but we need to ensure they're propagated
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Start the challenge session
      const startData = await gameApi.startChallenge(challengeId)
      setSessionId(startData.sessionId, startData.tierSessionId)
      useGameStore.setState({ totalScreenshots: startData.totalScreenshots })

      // Initialize position states for navigation tracking
      initializePositionStates(startData.totalScreenshots)

      // Fetch the first screenshot
      await fetchScreenshot(startData.sessionId, 1)

      setGamePhase('playing')

      // Pre-fetch all remaining screenshots in the background for smooth swiping
      // Don't await - let it run in the background
      prefetchAllScreenshots(startData.sessionId, startData.totalScreenshots).catch(() => {
        // Silently fail - pre-fetching is optional
      })
    } catch (err) {
      console.error('Failed to start game:', err)
      // Check if it's the "already completed" error via the structured code
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
      if (code === 'CHALLENGE_ALREADY_COMPLETED' || code === 'SESSION_ALREADY_COMPLETED') {
        setError(t('game.alreadyCompleted'))
      } else if (code === 'PREMIUM_REQUIRED_FOR_OLD_CATCHUP') {
        // Free user clicked an archived challenge they can't access. Send
        // them straight to the upsell instead of a dead-end error so the
        // upgrade path is one click away. Toast surfaces context briefly
        // before the navigation lands them on /premium.
        toast.info(t('game.premiumRequiredForOldCatchup'))
        setError(t('game.premiumRequiredForOldCatchup'))
        navigate(localizedPath('/premium'))
      } else {
        setError(t('game.errorStarting'))
      }
      setLoading(false)
    }
  }, [challengeId, session, isSessionPending, setSessionId, initializePositionStates, fetchScreenshot, setGamePhase, setLoading, prefetchAllScreenshots, t, navigate, localizedPath])

  // Fetch screenshot when position changes (after navigation)
  useEffect(() => {
    // Only fetch if we're in playing phase and have a session
    if (gamePhase === 'playing' && sessionId) {
      // Check if we already have the screenshot for this position
      if (currentScreenshotData?.position !== currentPosition) {
        fetchScreenshot(sessionId, currentPosition)
      }
    }
  }, [gamePhase, sessionId, currentPosition, currentScreenshotData?.position, fetchScreenshot])

  // Pre-fetch adjacent screenshots when current screenshot is loaded
  useEffect(() => {
    if (gamePhase === 'playing' && sessionId && currentScreenshotData?.imageUrl) {
      // Pre-fetch after a short delay to not interfere with current image loading
      const timer = setTimeout(() => {
        prefetchAdjacentScreenshots(sessionId, currentScreenshotData.position)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [gamePhase, sessionId, currentScreenshotData?.imageUrl, currentScreenshotData?.position, prefetchAdjacentScreenshots])

  // Handle resetting the daily session (admin only)
  const handleResetSession = useCallback(async () => {
    if (!isAdmin) return

    try {
      setIsResetting(true)
      await adminApi.resetMyDailySession()
      // Reset local game state
      useGameStore.getState().resetGame()
      // Reload the page to start fresh
      window.location.reload()
    } catch (err) {
      console.error('Failed to reset session:', err)
      setError(t('game.errorResetting'))
      setIsResetting(false)
    }
  }, [isAdmin, t])

  // Get the current image URL from screenshot data
  const currentImageUrl = currentScreenshotData?.imageUrl || null

  const handleGuestContinue = useCallback(() => {
    sessionStorage.setItem(GUEST_OPT_IN_KEY, '1')
    setGuestGateOpen(false)
    // Re-run start now that opt-in is recorded
    void handleStartGame()
  }, [handleStartGame])

  const handleGuestCreateAccount = useCallback(() => {
    setGuestGateOpen(false)
    navigate(localizedPath('/register'))
  }, [navigate, localizedPath])

  return (
    <div
      className="relative w-full bg-background overflow-hidden h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)]"
      style={{
        paddingBottom: isKeyboardOpen ? keyboardHeight : 0,
        transition: 'padding-bottom 200ms ease-out',
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
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center w-full h-full"
          >
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </motion.div>
        )}

        {/* Error State */}
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center w-full h-full px-4 sm:px-6"
          >
            {error.includes(t('game.alreadyCompleted')) ? (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="relative w-full max-w-md mx-auto"
              >
                {/* Ambient neon glow */}
                <div
                  aria-hidden="true"
                  className="absolute -inset-px rounded-2xl bg-linear-to-br from-neon-purple/20 via-transparent to-neon-pink/20 blur-2xl"
                />
                <div className="relative bg-card/80 backdrop-blur-xl border border-neon-purple/30 rounded-2xl p-6 sm:p-8 shadow-2xl">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative mb-4">
                      <div className="absolute inset-0 rounded-full bg-neon-purple/30 blur-xl" aria-hidden="true" />
                      <div className="relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-linear-to-br from-neon-purple to-neon-pink">
                        <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                      </div>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
                      {t('home.todayCompleted')}
                    </h2>
                    <p className="text-sm sm:text-base text-muted-foreground mb-5 max-w-sm">
                      {t('home.comeBackTomorrow')}
                    </p>

                    <div
                      role="timer"
                      aria-live="polite"
                      aria-atomic="true"
                      aria-label={`${t('home.nextDailyIn')} ${String(timeRemaining.hours).padStart(2, '0')}:${String(timeRemaining.minutes).padStart(2, '0')}:${String(timeRemaining.seconds).padStart(2, '0')}`}
                      className="w-full flex items-center justify-center gap-2 sm:gap-3 px-4 py-3 rounded-xl bg-background/60 border border-neon-purple/20 mb-6"
                    >
                      <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-neon-pink" aria-hidden="true" />
                      <span className="text-xs sm:text-sm text-muted-foreground">
                        {t('home.nextDailyIn')}
                      </span>
                      <span className="font-mono font-semibold text-foreground text-sm sm:text-base tabular-nums">
                        {String(timeRemaining.hours).padStart(2, '0')}:
                        {String(timeRemaining.minutes).padStart(2, '0')}:
                        {String(timeRemaining.seconds).padStart(2, '0')}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
                      <Button variant="gaming" asChild className="flex-1">
                        <Link to={localizedPath('/results')}>
                          <Trophy className="w-4 h-4 mr-2" />
                          {t('game.completionChoice.seeResults')}
                        </Link>
                      </Button>
                      <Button variant="outline" asChild className="flex-1">
                        <Link to={localizedPath('/')}>
                          <Home className="w-4 h-4 mr-2" />
                          {t('common.home')}
                        </Link>
                      </Button>
                      {session && session.user && session.user.id && (
                        <Button variant="outline" asChild className="flex-1">
                          <Link to={localizedPath('/history')}>
                            <History className="w-4 h-4 mr-2" />
                            {t('common.history')}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center gap-4 max-w-md text-center">
                <p className="text-destructive">{error}</p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button variant="gaming" asChild>
                    <Link to={localizedPath('/')}>
                      <Home className="w-4 h-4 mr-2" />
                      {t('common.home')}
                    </Link>
                  </Button>
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    {t('common.retry')}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Daily Challenge Intro Screen */}
        {gamePhase === 'daily_intro' && !error && (
          <DailyIntro
            key="daily-intro"
            date={challengeDate || new Date().toISOString().split('T')[0]!}
            totalScreenshots={totalScreenshots}
            onStart={handleStartGame}
            isCatchUp={isCatchUp}
          />
        )}

        {/* Main Game Screen */}
        {(gamePhase === 'playing' || gamePhase === 'result') && (
          <motion.div
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative w-full h-full flex flex-col"
          >
            {/* Score and End Game Button (Top Right) */}
            <div
              className="absolute right-2 sm:right-4 z-40 flex flex-col items-stretch min-w-28 sm:min-w-36"
              style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
            >
              <div className="bg-black/60 backdrop-blur-md rounded-t-xl px-4 sm:px-6 py-1.5 sm:py-2.5 border border-white/10 shadow-2xl">
                <ScoreDisplay />
              </div>
              <EndGameButton />
            </div>

            {/* Dynamic Blurred Background Layer */}
            {currentImageUrl && (
              <motion.div
                className="absolute inset-0 w-full h-full z-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <img
                  src={currentImageUrl}
                  alt=""
                  className="w-full h-full object-cover blur-3xl opacity-20 scale-110"
                  aria-hidden="true"
                />
                {/* Gradient overlays for ambient effect */}
                <div className="absolute inset-0 bg-linear-to-br from-neon-purple/10 via-transparent to-neon-pink/10 pointer-events-none" />
              </motion.div>
            )}

            {/* Screenshot Viewer — flex-1 so it fills all space above the dock. */}
            {/* When the layout viewport shrinks (Android keyboard) or we add */}
            {/* padding-bottom on the outer container (iOS keyboard), this area */}
            {/* shrinks naturally and the screenshot stays visible. */}
            <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center">
              {currentImageUrl ? (
                <ScreenshotViewer
                  imageUrl={currentImageUrl}
                  className="w-full h-full min-h-0"
                />
              ) : (
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              )}
              {/* Report button — overlay on the viewer; only shown while we
                  have a real screenshot in play. Pinned to the bottom-right
                  to avoid overlapping the score panel (z-40) at the top. */}
              {currentScreenshotData?.screenshotId && (
                <div className="absolute bottom-2 right-2 z-30">
                  <ReportCaptureDialog
                    target={{ screenshotId: currentScreenshotData.screenshotId }}
                    isAuthenticated={!!session?.user?.id}
                    iconOnly
                    triggerClassName="h-8 w-8 p-0 rounded-full bg-background/60 backdrop-blur-sm text-muted-foreground hover:text-destructive hover:bg-background/80"
                  />
                </div>
              )}
            </div>

            {/* Guess Input Dock — normal flow, pinned at bottom via flex-col. */}
            <div
              className="relative z-20 bg-linear-to-t from-background/95 via-background/90 to-transparent pt-3 md:pt-4 px-2 sm:px-3 md:px-4"
              style={{
                paddingBottom: isKeyboardOpen
                  ? '0.5rem'
                  : 'max(0.5rem, env(safe-area-inset-bottom))',
              }}
            >
              <div className="container mx-auto space-y-2 sm:space-y-3 md:space-y-4">
                <HintButtons />
                <div className="flex justify-center items-center">
                  <ProgressDots />
                </div>
                <GuessInput />
              </div>
              <SecondChanceModal />
            </div>

            {/* Result Card Overlay */}
            <AnimatePresence>
              {gamePhase === 'result' && <ResultCard />}
            </AnimatePresence>

            {/* Completion Choice Modal */}
            <CompletionChoiceModal />
          </motion.div>
        )}

        {/* Challenge Complete Screen */}
        {gamePhase === 'challenge_complete' && (
          <motion.div
            key="challenge-complete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center w-full h-full"
          >
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">{t('game.challengeComplete')}</h1>
              <p className="text-2xl text-primary font-bold mb-2">{totalScore} pts</p>

              {/* Hint Penalties Summary */}
              {(() => {
                const totalHintPenalties = guessResults.reduce((sum, result) => sum + (result.hintPenalty || 0), 0)
                return totalHintPenalties > 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-sm text-score-low mb-6"
                  >
                    {t('game.hints.penaltyApplied', { penalty: totalHintPenalties })}
                  </motion.div>
                ) : null
              })()}

              {/* World Total Score */}
              {worldScore !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center justify-center gap-3 text-muted-foreground mb-8"
                >
                  <Globe className="w-5 h-5" />
                  <span className="text-lg">
                    {t('game.worldTotal')}: <span className="font-bold text-foreground">{worldScore.toLocaleString()}</span> pts
                  </span>
                </motion.div>
              )}

              <div className="flex gap-4 justify-center flex-wrap">
                <Button variant="gaming" size="lg" asChild>
                  <Link to={localizedPath('/leaderboard')}>
                    <Trophy className="w-4 h-4 mr-2" />
                    {t('common.leaderboard')}
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link to={localizedPath('/')}>
                    <Home className="w-4 h-4 mr-2" />
                    {t('common.home')}
                  </Link>
                </Button>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleResetSession}
                    disabled={isResetting}
                  >
                    <RotateCcw className={`w-4 h-4 mr-2 ${isResetting ? 'animate-spin' : ''}`} />
                    {t('game.resetSession')}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
