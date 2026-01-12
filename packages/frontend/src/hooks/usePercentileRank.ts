import { useState, useEffect, useMemo } from 'react'
import { createLeaderboardService } from '@/services/leaderboardService'
import type { PercentileResult } from '@/services/types'

/**
 * Custom hook for fetching percentile ranking
 *
 * Fetches the user's percentile ranking based on their score
 */
export function usePercentileRank(score: number, enabled: boolean) {
  const [data, setData] = useState<PercentileResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const leaderboardService = useMemo(() => createLeaderboardService(), [])

  useEffect(() => {
    if (!enabled || score <= 0) {
      return
    }

    let cancelled = false

    const fetchPercentile = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await leaderboardService.getPercentile(score)

        if (!cancelled) {
          setData(result)
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error('Unknown error')
          setError(error)
          console.warn('Failed to fetch percentile:', error)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchPercentile()

    return () => {
      cancelled = true
    }
  }, [leaderboardService, score, enabled])

  return {
    percentile: data?.percentile ?? null,
    totalPlayers: data?.totalPlayers ?? null,
    rank: data?.rank ?? null,
    isLoading,
    error,
  }
}
