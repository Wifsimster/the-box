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

export function useDailyGame() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const [searchParams] = useSearchParams()
  const { data: session, isPending: isSessionPending } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [isResetting, setIsResetting] = useState(false)
  const [alreadyCompleted, setAlreadyCompleted] = useState(false)
  const isAdmin = session?.user?.role === 'admin'

  const { isKeyboardOpen, keyboardHeight } = useKeyboardHeight()
  const timeRemaining = useNextDailyCountdown()

  const [todayDateString] = useState(() => new Date().toISOString().split('T')[0]!)

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

  const leaderboardService = useMemo(() => createLeaderboardService(), [])

  const isCatchUp = !!challengeDate && challengeDate !== todayDateString

  const { worldScore } = useWorldScore(
    leaderboardService,
    gamePhase === 'challenge_complete'
  )

  useEffect(() => {
    if (gamePhase === 'challenge_complete') {
      navigate(localizedPath('/results'))
    }
  }, [gamePhase, navigate, localizedPath])

  const prefetchAllScreenshots = useCallback(async (sid: string, totalScreenshots: number) => {
    if (!sid) return

    const positions = Array.from({ length: totalScreenshots }, (_, i) => i + 1)
    const concurrency = Math.min(3, positions.length)
    let cursor = 0

    const prefetchOne = async (position: number): Promise<void> => {
      try {
        const data = await gameApi.getScreenshot(sid, position, { prefetch: true })
        const img = new Image()
        img.src = data.imageUrl
      } catch {
      }
    }

    const runLane = async (): Promise<void> => {
      if (cursor >= positions.length) return
      const position = positions[cursor]
      cursor += 1
      await prefetchOne(position)
      return runLane()
    }

    await Promise.all(Array.from({ length: concurrency }, () => runLane()))
  }, [])

  useEffect(() => {
    if (!_hasHydrated) return
    const { challengeDate: storeDate, gamePhase: storePhase } = useGameStore.getState()
    const targetDate = challengeDateParam || null

    if (targetDate && storeDate && targetDate !== storeDate) {
      useGameStore.getState().resetGameSession()
    } else if (!targetDate && storeDate) {
      const today = new Date().toISOString().split('T')[0]
      if (storeDate !== today && storePhase !== 'idle') {
        useGameStore.getState().resetGameSession()
      }
    }
  }, [_hasHydrated, challengeDateParam])

  useEffect(() => {
    if (!_hasHydrated) return

    const fetchChallenge = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await gameApi.getTodayChallenge(challengeDateParam || undefined)

        useGameStore.setState({ challengeDate: data.date })

        if (!data.challengeId) {
          setError(t('game.noChallengeAvailable', { date: data.date }))
          setLoading(false)
          return
        }

        setChallengeId(data.challengeId, data.date)
        useGameStore.setState({ totalScreenshots: data.totalScreenshots })

        if (data.userSession) {
          if (data.userSession.isCompleted) {
            setGamePhase('daily_intro')
            setAlreadyCompleted(true)
            setError(t('game.alreadyCompleted'))
            setLoading(false)
            return
          }

          setSessionId(data.userSession.sessionId, data.userSession.tierSessionId)

          restoreSessionState({
            challengeId: data.challengeId,
            correctPositions: data.userSession.correctPositions,
            currentPosition: data.userSession.currentPosition,
            totalScreenshots: data.totalScreenshots,
            screenshotsFound: data.userSession.screenshotsFound,
            totalScore: data.userSession.totalScore,
          })

          const restoredPosition = useGameStore.getState().currentPosition

          const screenshotData = await gameApi.getScreenshot(
            data.userSession.sessionId,
            restoredPosition
          )
          setScreenshotData(screenshotData)
          setGamePhase('playing')
          setLoading(false)

          prefetchAllScreenshots(data.userSession.sessionId, data.totalScreenshots).catch(() => {
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

  const fetchScreenshot = useCallback((sid: string, position: number) => {
    setLoading(true)
    return gameApi
      .getScreenshot(sid, position)
      .then(
        (data) => {
          if (useGameStore.getState().currentPosition !== position) return
          setScreenshotData(data)
        },
        (err) => {
          console.error('Failed to fetch screenshot:', err)
          setError(t('game.errorLoadingScreenshot'))
        },
      )
      .finally(() => {
        setLoading(false)
      })
  }, [setScreenshotData, setLoading, t])

  const prefetchAdjacentScreenshots = useCallback(async (sid: string, currentPos: number) => {
    if (!sid || gamePhase !== 'playing') return

    const { positionStates, totalScreenshots } = useGameStore.getState()

    const findNextPosition = () => {
      for (let i = currentPos + 1; i <= totalScreenshots; i++) {
        const state = positionStates[i]
        if (!state || state.status === 'not_visited' || state.status === 'skipped' || state.status === 'correct') {
          return i
        }
      }
      for (let i = 1; i < currentPos; i++) {
        const state = positionStates[i]
        if (state?.status === 'skipped' || state?.status === 'correct') {
          return i
        }
      }
      return null
    }

    const findPreviousPosition = () => {
      for (let i = currentPos - 1; i >= 1; i--) {
        const state = positionStates[i]
        if (state?.status === 'skipped' || state?.status === 'not_visited' || state?.status === 'correct') {
          return i
        }
      }
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

    if (nextPos) {
      try {
        const nextData = await gameApi.getScreenshot(sid, nextPos, { prefetch: true })
        const img = new Image()
        img.src = nextData.imageUrl
      } catch {
      }
    }

    if (prevPos) {
      try {
        const prevData = await gameApi.getScreenshot(sid, prevPos, { prefetch: true })
        const img = new Image()
        img.src = prevData.imageUrl
      } catch {
      }
    }
  }, [gamePhase])

  const handleStartGame = useCallback(async () => {
    if (!challengeId) {
      setError(t('game.noChallenge'))
      return
    }

    try {
      setLoading(true)
      setError(null)

      useGameStore.setState({
        totalScore: 0,
        correctAnswers: 0,
        guessResults: [],
        positionAttempts: {},
        lastResult: null,
        screenshotsFound: 0,
      })

      if (!session && !isSessionPending) {
        const signInResult = await authClient.signIn.anonymous()
        if (signInResult.error) {
          console.error('Failed to sign in as guest:', signInResult.error)
          setError(t('game.errorStarting'))
          setLoading(false)
          return
        }

        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const startData = await gameApi.startChallenge(challengeId)
      setSessionId(startData.sessionId, startData.tierSessionId)
      useGameStore.setState({ totalScreenshots: startData.totalScreenshots })

      initializePositionStates(startData.totalScreenshots)

      await fetchScreenshot(startData.sessionId, 1)

      setGamePhase('playing')

      prefetchAllScreenshots(startData.sessionId, startData.totalScreenshots).catch(() => {
      })
    } catch (err) {
      console.error('Failed to start game:', err)
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
      if (code === 'CHALLENGE_ALREADY_COMPLETED' || code === 'SESSION_ALREADY_COMPLETED') {
        setAlreadyCompleted(true)
        setError(t('game.alreadyCompleted'))
      } else if (code === 'PREMIUM_REQUIRED_FOR_OLD_CATCHUP') {
        toast.info(t('game.premiumRequiredForOldCatchup'))
        setError(t('game.premiumRequiredForOldCatchup'))
        navigate(localizedPath('/premium'))
      } else {
        setError(t('game.errorStarting'))
      }
      setLoading(false)
    }
  }, [challengeId, session, isSessionPending, setSessionId, initializePositionStates, fetchScreenshot, setGamePhase, setLoading, prefetchAllScreenshots, t, navigate, localizedPath])

  useEffect(() => {
    if (gamePhase === 'playing' && sessionId) {
      if (currentScreenshotData?.position !== currentPosition) {
        fetchScreenshot(sessionId, currentPosition)
      }
    }
  }, [gamePhase, sessionId, currentPosition, currentScreenshotData?.position, fetchScreenshot])

  useEffect(() => {
    if (gamePhase === 'playing' && sessionId && currentScreenshotData?.imageUrl) {
      const timer = setTimeout(() => {
        prefetchAdjacentScreenshots(sessionId, currentScreenshotData.position)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [gamePhase, sessionId, currentScreenshotData?.imageUrl, currentScreenshotData?.position, prefetchAdjacentScreenshots])

  const handleResetSession = useCallback(async () => {
    if (!isAdmin) return

    try {
      setIsResetting(true)
      await adminApi.resetMyDailySession()
      useGameStore.getState().resetGame()
      window.location.reload()
    } catch (err) {
      console.error('Failed to reset session:', err)
      setError(t('game.errorResetting'))
      setIsResetting(false)
    }
  }, [isAdmin, t])

  const currentImageUrl = currentScreenshotData?.imageUrl || null

  return {
    error,
    alreadyCompleted,
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
  }
}
