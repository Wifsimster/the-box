import { useState, useEffect } from 'react'
import type { LeaderboardService } from '@/services/types'

/**
 * Custom hook for fetching world total score
 *
 * Separates data fetching logic from UI components
 */
export function useWorldScore(
  leaderboardService: LeaderboardService,
  enabled: boolean
) {
  const [worldScore, setWorldScore] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false

    const fetchWorldScore = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const score = await leaderboardService.getWorldTotalScore()

        if (!cancelled) {
          setWorldScore(score)
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error('Unknown error')
          setError(error)
          console.warn('Failed to fetch world score:', error)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchWorldScore()

    return () => {
      cancelled = true
    }
  }, [leaderboardService, enabled])

  return {
    worldScore,
    isLoading,
    error,
  }
}
