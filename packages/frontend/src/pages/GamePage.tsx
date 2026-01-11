import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { DailyIntro } from '@/components/game/TierIntro'
import { ScreenshotViewer } from '@/components/game/ScreenshotViewer'
import { GuessInput } from '@/components/game/GuessInput'
import { ScoreDisplay } from '@/components/game/ScoreDisplay'
import { ResultCard } from '@/components/game/ResultCard'
import { LiveLeaderboard } from '@/components/game/LiveLeaderboard'
import { ProgressDots } from '@/components/game/ProgressDots'
import { Button } from '@/components/ui/button'
import { Globe, Home, Loader2 } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useWorldScore } from '@/hooks/useWorldScore'
import { createLeaderboardService } from '@/services'
import { gameApi } from '@/lib/api'
import { authClient, useSession } from '@/lib/auth-client'

export default function GamePage() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const { data: session, isPending: isSessionPending } = useSession()
  const [error, setError] = useState<string | null>(null)
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
    setGamePhase,
    setChallengeId,
    setSessionId,
    setScreenshotData,
    setSessionScoring,
    setLoading,
    initializePositionStates,
    restoreSessionState,
  } = useGameStore()

  // Service for leaderboard operations
  const leaderboardService = useMemo(() => createLeaderboardService(), [])

  // Fetch world total score when challenge is complete
  const { worldScore } = useWorldScore(
    leaderboardService,
    gamePhase === 'challenge_complete'
  )

  // Fetch today's challenge on mount (after hydration completes)
  useEffect(() => {
    // Wait for Zustand to hydrate from localStorage before fetching
    // This ensures persisted state (positionStates, currentPosition) is available
    if (!_hasHydrated) return

    const fetchChallenge = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await gameApi.getTodayChallenge()

        if (data.challengeId) {
          setChallengeId(data.challengeId, data.date)
          // Store total screenshots from challenge
          useGameStore.setState({ totalScreenshots: data.totalScreenshots })

          // If user has an existing incomplete session, restore and resume
          if (data.userSession && !data.userSession.isCompleted) {
            setSessionId(data.userSession.sessionId, data.userSession.tierSessionId)

            // Restore full session state from backend (merges with persisted local state)
            restoreSessionState({
              correctPositions: data.userSession.correctPositions,
              currentPosition: data.userSession.currentPosition,
              totalScreenshots: data.totalScreenshots,
              screenshotsFound: data.userSession.screenshotsFound,
              totalScore: data.userSession.totalScore,
              sessionStartedAt: data.userSession.sessionStartedAt,
              scoringConfig: data.userSession.scoringConfig,
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
            return
          }
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
  }, [_hasHydrated, gamePhase, setGamePhase, setChallengeId, setSessionId, setScreenshotData, setLoading, restoreSessionState, t])

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
        await authClient.signIn.anonymous()
      }

      // Start the challenge session
      const startData = await gameApi.startChallenge(challengeId)
      setSessionId(startData.sessionId, startData.tierSessionId)
      useGameStore.setState({ totalScreenshots: startData.totalScreenshots })

      // Set up countdown scoring from server config
      setSessionScoring(startData.scoringConfig, startData.sessionStartedAt)

      // Initialize position states for navigation tracking
      initializePositionStates(startData.totalScreenshots)

      // Start the score countdown timer
      useGameStore.getState().startScoreCountdown()

      // Fetch the first screenshot
      await fetchScreenshot(startData.sessionId, 1)

      setGamePhase('playing')
    } catch (err) {
      console.error('Failed to start game:', err)
      setError(t('game.errorStarting'))
      setLoading(false)
    }
  }, [challengeId, session, isSessionPending, setSessionId, setSessionScoring, initializePositionStates, fetchScreenshot, setGamePhase, setLoading, t])

  // Fetch next screenshot when position changes (after nextRound is called)
  useEffect(() => {
    // Only fetch if we're transitioning to playing phase and have a session
    if (gamePhase === 'playing' && sessionId && currentPosition > 1) {
      // Check if we already have the screenshot for this position
      if (currentScreenshotData?.position !== currentPosition) {
        fetchScreenshot(sessionId, currentPosition)
      }
    }
  }, [gamePhase, sessionId, currentPosition, currentScreenshotData?.position, fetchScreenshot])

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
            <Button variant="outline" onClick={() => window.location.reload()}>
              {t('common.retry')}
            </Button>
          </motion.div>
        )}

        {/* Daily Challenge Intro Screen */}
        {gamePhase === 'daily_intro' && !error && (
          <DailyIntro
            key="daily-intro"
            date={challengeDate || new Date().toISOString().split('T')[0]!}
            totalScreenshots={totalScreenshots}
            onStart={handleStartGame}
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
            {/* Home Button (Top Left) */}
            <div className="absolute top-4 left-4 z-40">
              <Button variant="ghost" size="sm" asChild>
                <Link to={localizedPath('/')}>
                  <Home className="w-4 h-4 mr-1" />
                  {t('common.home')}
                </Link>
              </Button>
            </div>

            {/* Score (Top Right) */}
            <div className="absolute top-4 right-4 z-40">
              <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2">
                <ScoreDisplay />
              </div>
            </div>

            {/* Screenshot Viewer (Full Screen) */}
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

            {/* Live Leaderboard (Left Side) */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20">
              <LiveLeaderboard />
            </div>

            {/* Pagination (Bottom Right) */}
            <div className="absolute bottom-4 right-4 z-30">
              <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2">
                <div className="text-lg font-bold text-white drop-shadow-lg">
                  {currentPosition}/{totalScreenshots}
                </div>
              </div>
            </div>

            {/* Guess Input (Bottom Center) */}
            <div className="absolute bottom-0 left-0 right-0 z-20 bg-linear-to-t from-background/90 to-transparent pt-8 pb-4 px-4">
              <div className="container mx-auto max-w-2xl space-y-4">
                {/* Progress Dots (Above Input) */}
                <div className="flex justify-center">
                  <ProgressDots />
                </div>
                <GuessInput />
              </div>
            </div>

            {/* Result Card Overlay */}
            <AnimatePresence>
              {gamePhase === 'result' && <ResultCard />}
            </AnimatePresence>
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
              <p className="text-2xl text-primary font-bold mb-8">{totalScore} pts</p>

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

              <Button variant="gaming" size="lg" asChild>
                <Link to={localizedPath('/')}>
                  <Home className="w-4 h-4 mr-2" />
                  {t('common.home')}
                </Link>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
