import { useCallback, useEffect, useState } from 'react'

export interface GeoHealth {
    coverage: { curated: number; resolved: number; withMap: number; total: number }
    queue: { active: number; waiting: number; delayed: number; failed: number }
    nextChallenge: { id: number; date: string } | null
    failures: Array<unknown>
}

/**
 * Polls /api/admin/geo/health every 30s. Used by GeoHeaderStrip (counters)
 * and GeoReviewPanel (cold-start banner). Lifted out of GeoHeaderStrip so
 * the parent panel can derive cold-start state without a second fetch.
 */
export function useGeoHealth(intervalMs = 30_000) {
    const [data, setData] = useState<GeoHealth | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    const reload = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/geo/health', { credentials: 'include' })
            const json = await res.json().catch(() => ({}))
            if (!res.ok || !json?.success) throw new Error('health failed')
            setData(json.data as GeoHealth)
            setError(false)
        } catch {
            setError(true)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void reload()
        const id = window.setInterval(() => void reload(), intervalMs)
        return () => window.clearInterval(id)
    }, [reload, intervalMs])

    return { data, loading, error, reload }
}
