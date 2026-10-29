import { useState, useEffect, useMemo } from 'react'
import { createLeaderboardService } from '@/services/leaderboardService'
import type { PercentileResult } from '@/services/types'
import { displayableStanding } from '@/lib/standing'

interface PercentileRankInput {
  sessionId: string | null
  score: number
  enabled: boolean
}

export function usePercentileRank({ sessionId, score, enabled }: PercentileRankInput) {
  const [data, setData] = useState<{ key: string; result: PercentileResult | null } | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const leaderboardService = useMemo(() => createLeaderboardService(), [])

  const key = sessionId ? `session:${sessionId}` : `score:${score}`
  const active = enabled && (sessionId !== null || score > 0)

  useEffect(() => {
    if (!active) return

    let cancelled = false

    const fetchStanding = async () => {
      setError(null)
      try {
        const result = sessionId
          ? await leaderboardService.getSessionStanding(sessionId)
          : await leaderboardService.getPercentile(score)
        if (!cancelled) setData({ key, result })
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error('Unknown error')
          setError(error)
          setData({ key, result: null })
          console.warn('Failed to fetch standing:', error)
        }
      }
    }

    fetchStanding()

    return () => {
      cancelled = true
    }
  }, [leaderboardService, active, key, sessionId, score])

  const current = data?.key === key ? data.result : null
  const standing = displayableStanding(current ?? {})

  return {
    percentile: standing.percentile,
    totalPlayers: standing.totalPlayers,
    rank: standing.rank,
    isLoading: active && data?.key !== key,
    error,
  }
}
