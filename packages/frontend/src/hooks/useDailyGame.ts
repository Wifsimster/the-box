import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useGameStore } from '@/stores/gameStore'
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'
import { adminApi } from '@/lib/api/admin'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useNextDailyCountdown } from '@/hooks/useNextDailyCountdown'
import { useWorldScore } from '@/hooks/useWorldScore'
import { createLeaderboardService } from '@/services'
import { gameApi } from '@/lib/api'
import { authClient, useSession } from '@/lib/auth-client'

const GUEST_OPT_IN_KEY = 'theBox.guestOptIn'

/**
 * Orchestrates the daily-game loop: challenge fetch + resume, screenshot
 * prefetching, start/reset handlers and the guest-gate flow. Extracted from
 * GamePage so that component is a thin presentational shell over this hook.
 */
export function useDailyGame() {
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

  // Today's date (yyyy-mm-dd) computed once per mount rather than inline in
  // JSX — keeps `new Date()` out of the render path so it can't render
  // differently between commits.
  const todayDateString = useMemo(() => new Date().toISOString().split('T')[0]!, [])

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

    // Pre-fetch all screenshots, capping concurrency at 3 so we don't
    // overwhelm the server. Rather than awaiting batch-by-batch in a loop
    // (which idles whenever the slowest request in a batch lags), run a
    // fixed pool of workers that each pull the next position off a shared
    // cursor — steady 3-in-flight throughput with no loop-carried await.
    const positions = Array.from({ length: totalScreenshots }, (_, i) => i + 1)
    const concurrency = Math.min(3, positions.length)
    let cursor = 0

    const prefetchOne = async (position: number): Promise<void> => {
      try {
        const data = await gameApi.getScreenshot(sid, position, { prefetch: true })
        // Preload the image in browser cache
        const img = new Image()
        img.src = data.imageUrl
      } catch {
        // Silently fail - pre-fetching is optional
      }
    }

    // Each lane recursively pulls the next position off the shared cursor and
    // chains to the following one. Recursion (rather than a while-await loop)
    // keeps a steady `concurrency` requests in flight without idling on the
    // slowest item of a fixed batch.
    const runLane = async (): Promise<void> => {
      if (cursor >= positions.length) return
      const position = positions[cursor]
      cursor += 1
      await prefetchOne(position)
      return runLane()
    }

    await Promise.all(Array.from({ length: concurrency }, () => runLane()))
  }, [])

  // Reset game session when the URL date param changes (e.g. switching from today to catch-up)
  // This ensures stale session state doesn't prevent loading a different challenge
  useEffect(() => {
    if (!_hasHydrated) return
    // Read the current phase straight from the store rather than closing over
    // the `gamePhase` render value, so this effect only re-runs when the date
    // param (or hydration) changes — not on every phase transition.
    const { challengeDate: storeDate, gamePhase: storePhase } = useGameStore.getState()
    const targetDate = challengeDateParam || null

    // If we have a URL date that differs from the store, or if the store has a stale
    // catch-up date but we're navigating to today (no date param), reset the session
    if (targetDate && storeDate && targetDate !== storeDate) {
      useGameStore.getState().resetGameSession()
    } else if (!targetDate && storeDate) {
      const today = new Date().toISOString().split('T')[0]
      if (storeDate !== today && storePhase !== 'idle') {
        useGameStore.getState().resetGameSession()
      }
    }
  }, [_hasHydrated, challengeDateParam])

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

  return {
    // status
    error,
    isResetting,
    isLoading,
    _hasHydrated,
    gamePhase,
    // session / identity
    session,
    isAdmin,
    // layout
    isKeyboardOpen,
    keyboardHeight,
    timeRemaining,
    // challenge data
    todayDateString,
    challengeDate,
    totalScreenshots,
    totalScore,
    guessResults,
    currentScreenshotData,
    currentImageUrl,
    worldScore,
    isCatchUp,
    // guest gate
    guestGateOpen,
    // handlers
    handleStartGame,
    handleResetSession,
    handleGuestContinue,
    handleGuestCreateAccount,
  }
}
