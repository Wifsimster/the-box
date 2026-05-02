import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

// Zod-validated shape so a backend deploy that drifts from the contract
// surfaces as a clean parse error rather than mysteriously crashing the
// counter strip / cold-start banner with `undefined.curated`.
const GeoHealthSchema = z.object({
    coverage: z.object({
        curated: z.number(),
        resolved: z.number(),
        withMap: z.number(),
        total: z.number(),
    }),
    queue: z.object({
        active: z.number(),
        waiting: z.number(),
        delayed: z.number(),
        failed: z.number(),
    }),
    nextChallenge: z
        .object({
            id: z.number(),
            date: z.string(),
        })
        .nullable(),
    failures: z.array(z.unknown()),
})

export type GeoHealth = z.infer<typeof GeoHealthSchema>

/**
 * Polls /api/admin/geo/health every 30s. Consumed by ModerationStatusRail
 * (counter row + cold-start / readiness sections) via GeoReviewPanel, so
 * all status surfaces stay in sync without duplicate fetches.
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
            const parsed = GeoHealthSchema.safeParse(json.data)
            if (!parsed.success) throw new Error('health shape mismatch')
            setData(parsed.data)
            setError(false)
        } catch {
            setError(true)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        // Pause the 30s health poll when the tab is hidden — without this
        // an admin who leaves the panel in a background tab keeps a slow
        // drumbeat against /admin/geo/health forever.
        let id: number | null = null
        const start = () => {
            if (id != null) return
            void reload()
            id = window.setInterval(() => void reload(), intervalMs)
        }
        const stop = () => {
            if (id != null) {
                window.clearInterval(id)
                id = null
            }
        }
        const onVis = () => {
            if (typeof document === 'undefined') return
            if (document.visibilityState === 'hidden') stop()
            else start()
        }
        if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
            start()
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', onVis)
        }
        return () => {
            stop()
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', onVis)
            }
        }
    }, [reload, intervalMs])

    return { data, loading, error, reload }
}
