import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'
import { useIsMobile } from '@/hooks/useIsMobile'
import { DailyIntro } from '@/components/game/TierIntro'
import { ScreenshotViewer } from '@/components/game/ScreenshotViewer'
import { GuessInput } from '@/components/game/GuessInput'
import { HintButtons } from '@/components/game/HintButtons'
import { ScoreDisplay } from '@/components/game/ScoreDisplay'
import { ResultCard } from '@/components/game/ResultCard'
import { CompletionChoiceModal } from '@/components/game/CompletionChoiceModal'
import { ProgressDots } from '@/components/game/ProgressDots'
import { EndGameButton } from '@/components/game/EndGameButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Globe, Home, Loader2, Trophy, RotateCcw, Menu, Settings, History, LogOut } from 'lucide-react'
import { adminApi } from '@/lib/api/admin'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useWorldScore } from '@/hooks/useWorldScore'
import { createLeaderboardService } from '@/services'
import { gameApi } from '@/lib/api'
import { authClient, useSession } from '@/lib/auth-client'

export default function GamePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const [searchParams] = useSearchParams()
  const { data: session, isPending: isSessionPending } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [isResetting, setIsResetting] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isAdmin = session?.user?.role === 'admin'

  // Keyboard detection for mobile layout adjustment
  const { isKeyboardOpen, keyboardHeight } = useKeyboardHeight()
  const isMobile = useIsMobile()

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
            const data = await gameApi.getScreenshot(sid, position)
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
        const nextData = await gameApi.getScreenshot(sid, nextPos)
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
        const prevData = await gameApi.getScreenshot(sid, prevPos)
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
      // This clears any persisted state from previously completed games
      useGameStore.setState({
        totalScore: 0,
        correctAnswers: 0,
        guessResults: [],
        lastResult: null,
        screenshotsFound: 0,
      })

      // Auto-login as guest if not authenticated
      if (!session && !isSessionPending) {
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
      // Check if it's the "already completed" error
      if (err instanceof Error && err.message.includes('already completed')) {
        setError(t('game.alreadyCompleted'))
      } else {
        setError(t('game.errorStarting'))
      }
      setLoading(false)
    }
  }, [challengeId, session, isSessionPending, setSessionId, initializePositionStates, fetchScreenshot, setGamePhase, setLoading, prefetchAllScreenshots, t])

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

  // Keyboard shortcuts for navigation (Ctrl+Arrow Left/Right)
  // Uses Ctrl+Arrow to avoid interfering with text cursor navigation
  useEffect(() => {
    if (gamePhase !== 'playing') return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger on Ctrl+Arrow (or Cmd+Arrow on Mac)
      if (!e.ctrlKey && !e.metaKey) return

      const {
        currentPosition,
        positionStates,
        skipToNextPosition,
        navigateToPosition,
      } = useGameStore.getState()

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        // Find previous navigable position (include skipped, not_visited, and correct)
        for (let i = currentPosition - 1; i >= 1; i--) {
          const state = positionStates[i]
          if (state?.status === 'skipped' || state?.status === 'not_visited' || state?.status === 'correct') {
            navigateToPosition(i)
            return
          }
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        // Skip to next position (includes correct positions)
        skipToNextPosition()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gamePhase])

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

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
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
            className="flex flex-col items-center justify-center w-full h-full gap-4"
          >
            <p className="text-destructive">{error}</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button variant="gaming" asChild>
                <Link to={localizedPath('/')}>
                  <Home className="w-4 h-4 mr-2" />
                  {t('common.home')}
                </Link>
              </Button>
              {/* Show History button if challenge is already completed and user is authenticated */}
              {error.includes(t('game.alreadyCompleted')) && session && session.user && session.user.id && (
                <Button variant="outline" asChild>
                  <Link to={localizedPath('/history')}>
                    <History className="w-4 h-4 mr-2" />
                    {t('common.history')}
                  </Link>
                </Button>
              )}
              {/* Only show retry button if it's not the "already completed" error */}
              {!error.includes(t('game.alreadyCompleted')) && (
                <Button variant="outline" onClick={() => window.location.reload()}>
                  {t('common.retry')}
                </Button>
              )}
            </div>
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
            className="relative w-full h-full"
          >
            {/* Mobile Menu and Home Button (Top Left) */}
            <div className="absolute top-1 left-2 sm:top-2 sm:left-4 z-40 flex items-center gap-1 sm:gap-2">
              {/* Mobile Menu Button - shown on mobile, hidden on md and up */}
              <div className="md:hidden">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-2">
                      <Menu className="h-4 w-4" />
                      <span className="sr-only">Toggle menu</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-70 sm:w-80">
                    <SheetHeader>
                      <SheetTitle className="text-left">Menu</SheetTitle>
                    </SheetHeader>
                    <div className="flex flex-col gap-2 mt-6">
                      <Button variant="ghost" size="sm" asChild className="w-full justify-start">
                        <Link to={localizedPath('/')} onClick={() => setMobileMenuOpen(false)}>
                          <Home className="w-4 h-4 mr-2" />
                          {t('common.home')}
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild className="w-full justify-start">
                        <Link to={localizedPath('/leaderboard')} onClick={() => setMobileMenuOpen(false)}>
                          <Trophy className="w-4 h-4 mr-2" />
                          {t('common.leaderboard')}
                        </Link>
                      </Button>
                      {session && session.user && session.user.id && (
                        <Button variant="ghost" size="sm" asChild className="w-full justify-start">
                          <Link to={localizedPath('/history')} onClick={() => setMobileMenuOpen(false)}>
                            <History className="w-4 h-4 mr-2" />
                            {t('common.history')}
                          </Link>
                        </Button>
                      )}
                      {isAdmin && (
                        <Button variant="ghost" size="sm" asChild className="w-full justify-start">
                          <Link to={localizedPath('/admin')} onClick={() => setMobileMenuOpen(false)}>
                            <Settings className="w-4 h-4 mr-2" />
                            {t('common.admin')}
                          </Link>
                        </Button>
                      )}
                      {session && session.user && session.user.id && (
                        <div className="border-t border-border pt-4 mt-4">
                          <div className="flex flex-col gap-3">
                            {session.user.name !== 'Anonymous' && (
                              <div className="flex items-center justify-between">
                                {session.user.role === 'admin' ? (
                                  <Badge variant="admin">
                                    {session.user.name || session.user.email?.split('@')[0]}
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    {session.user.name || session.user.email?.split('@')[0]}
                                  </span>
                                )}
                              </div>
                            )}
                            <Button variant="ghost" size="sm" onClick={async () => {
                              await authClient.signOut()
                              setMobileMenuOpen(false)
                              navigate(localizedPath('/'))
                            }} className="w-full justify-start">
                              <LogOut className="w-4 h-4 mr-2" />
                              {t('common.logout')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              {/* Home Button */}
              <Button variant="ghost" size="sm" asChild className="h-8 sm:h-9 px-2 sm:px-3">
                <Link to={localizedPath('/')}>
                  <Home className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:mr-1" />
                  <span className="hidden md:inline text-xs sm:text-sm">{t('common.home')}</span>
                </Link>
              </Button>
            </div>

            {/* Score and End Game Button (Top Right) */}
            <div className="absolute top-1 right-2 sm:top-2 sm:right-4 z-40 flex items-center gap-2">
              <EndGameButton />
              <div className="bg-black/50 backdrop-blur-sm rounded-lg px-2 sm:px-4 py-1.5 sm:py-2">
                <ScoreDisplay />
              </div>
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

            {/* Screenshot Viewer (Full Screen) */}
            {/* On mobile, center vertically; on desktop, full screen */}
            {/* When keyboard is open on mobile, reduce height and shift up */}
            <motion.div
              className="absolute inset-0 w-full flex items-center justify-center md:block z-10"
              initial={isMobile ? undefined : false}
              animate={{
                height: isKeyboardOpen ? `calc(100% - ${keyboardHeight}px - 120px)` : '100%',
              }}
              transition={isMobile ? { duration: 0.3, ease: 'easeOut' } : { duration: 0 }}
            >
              {currentImageUrl ? (
                <ScreenshotViewer
                  imageUrl={currentImageUrl}
                  className="w-full h-full"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              )}
            </motion.div>

            {/* Guess Input (Bottom Center) */}
            {/* Slides up when keyboard is open on mobile */}
            <motion.div
              className="absolute left-0 right-0 z-20 bg-linear-to-t from-background/95 via-background/90 to-transparent pt-2 sm:pt-3 md:pt-4 pb-2 sm:pb-3 md:pb-4 px-2 sm:px-3 md:px-4"
              initial={isMobile ? undefined : false}
              animate={{
                bottom: isKeyboardOpen ? keyboardHeight : 0,
              }}
              transition={isMobile ? { duration: 0.3, ease: 'easeOut' } : { duration: 0 }}
            >
              <div className="container mx-auto space-y-2 sm:space-y-3 md:space-y-4">
                {/* Hint Buttons (Above Progress Dots) */}
                <HintButtons />
                {/* Progress Dots (Above Input) */}
                <div className="flex justify-center items-center gap-2 sm:gap-3 md:gap-4">
                  <ProgressDots />
                </div>
                <GuessInput />
              </div>
            </motion.div>

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
                    className="text-sm text-orange-400 mb-6"
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
                <Button variant="gaming" size="lg" asChild>
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
