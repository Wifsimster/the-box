import { useCallback, useEffect, useRef, useState } from 'react'

// Job kinds we care to surface in the manual-run progress UI. Mirrors the
// backend's GeoJobData.kind minus consensus/promote-tier (those are unrelated
// to the ingestion pipeline and the route already filters them out).
export type GeoRunJobKind =
    | 'resolve-metadata'
    | 'ingest-tick'
    | 'import-registry-map'
    | 'import-fandom-map'
    | 'import-wikidata-map'
    | 'import-steam-screenshots'
    | 'schedule-daily-challenge'

export type GeoRunJobState = 'active' | 'waiting' | 'delayed'

export interface GeoRunJob {
    kind: GeoRunJobKind
    state: GeoRunJobState
}

export interface GeoRunStatePayload {
    isActive: boolean
    counts: {
        active: number
        waiting: number
        delayed: number
        failed: number
        completed: number
    }
    byGame: Record<number, GeoRunJob[]>
    globals: GeoRunJob[]
}

export interface UseGeoRunPolling {
    state: GeoRunStatePayload | null
    error: string | null
    /**
     * Force a poll burst for at least `windowMs` (default 5s). Covers the
     * lag between enqueue and the first time a fresh job shows up in
     * BullMQ's active/waiting sets.
     */
    arm: (windowMs?: number) => void
}

const DEFAULT_INTERVAL_MS = 2000
const ARM_FLOOR_MS = 5000

async function fetchState(): Promise<GeoRunStatePayload> {
    const res = await fetch('/api/admin/geo/run/state', { credentials: 'include' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.success) {
        throw new Error(json?.error?.code ?? `request failed: ${res.status}`)
    }
    return json.data as GeoRunStatePayload
}

/**
 * Poll while either:
 *  - the most recent response said `isActive=true`, or
 *  - `arm()` was called within the last `armWindowMs`.
 *
 * Stops on its own when both go false to avoid hammering the endpoint
 * during quiet periods.
 */
export function useGeoRunPolling(intervalMs = DEFAULT_INTERVAL_MS): UseGeoRunPolling {
    const [state, setState] = useState<GeoRunStatePayload | null>(null)
    const [error, setError] = useState<string | null>(null)
    // Mutable refs so the interval callback always reads the latest values.
    const armedUntilRef = useRef<number>(0)
    const isActiveRef = useRef<boolean>(false)
    // Bumping this nudges the polling effect to (re)start the interval after
    // arm() — needed because arm() doesn't change any reactive state.
    const [pollNonce, setPollNonce] = useState(0)

    useEffect(() => {
        isActiveRef.current = state?.isActive ?? false
    }, [state?.isActive])

    useEffect(() => {
        let cancelled = false
        const tick = async () => {
            try {
                const data = await fetchState()
                if (cancelled) return
                setState(data)
                setError(null)
            } catch (e) {
                if (cancelled) return
                setError(String(e))
            }
        }

        const shouldPoll = () =>
            Date.now() < armedUntilRef.current || isActiveRef.current

        if (!shouldPoll()) return undefined

        // Fire once immediately so the UI updates without waiting `intervalMs`.
        void tick()
        const id = window.setInterval(() => {
            if (!shouldPoll()) {
                window.clearInterval(id)
                return
            }
            void tick()
        }, intervalMs)

        return () => {
            cancelled = true
            window.clearInterval(id)
        }
    }, [intervalMs, pollNonce, state?.isActive])

    const arm = useCallback((windowMs = ARM_FLOOR_MS) => {
        armedUntilRef.current = Date.now() + windowMs
        setPollNonce((n) => n + 1)
    }, [])

    return { state, error, arm }
}

// Helper: which tiers are currently in flight for a given game. Maps the
// per-source job kinds to the tier labels the maps tab already uses.
export function tiersInFlightForGame(
    state: GeoRunStatePayload | null,
    gameId: number,
): Set<'registry' | 'fandom' | 'wikidata' | 'steam' | 'metadata' | 'tick'> {
    const out = new Set<
        'registry' | 'fandom' | 'wikidata' | 'steam' | 'metadata' | 'tick'
    >()
    const jobs = state?.byGame[gameId]
    if (!jobs) return out
    for (const job of jobs) {
        if (job.kind === 'import-registry-map') out.add('registry')
        else if (job.kind === 'import-fandom-map') out.add('fandom')
        else if (job.kind === 'import-wikidata-map') out.add('wikidata')
        else if (job.kind === 'import-steam-screenshots') out.add('steam')
        else if (job.kind === 'resolve-metadata') out.add('metadata')
        else if (job.kind === 'ingest-tick') out.add('tick')
    }
    return out
}

export function isGameInFlight(
    state: GeoRunStatePayload | null,
    gameId: number,
): boolean {
    return (state?.byGame[gameId]?.length ?? 0) > 0
}
