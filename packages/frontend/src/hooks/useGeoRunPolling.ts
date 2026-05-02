import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

// Job kinds we care to surface in the manual-run progress UI. Mirrors the
// backend's GeoJobData.kind minus consensus/promote-tier (those are unrelated
// to the ingestion pipeline and the route already filters them out).
const GeoRunJobKindSchema = z.enum([
    'resolve-metadata',
    'ingest-tick',
    'import-registry-map',
    'import-fandom-map',
    'import-strategywiki-map',
    'import-fextralife-map',
    'import-wand-map',
    'import-wikidata-map',
    'import-steam-screenshots',
    'schedule-daily-challenge',
])
export type GeoRunJobKind = z.infer<typeof GeoRunJobKindSchema>

const GeoRunJobStateSchema = z.enum(['active', 'waiting', 'delayed'])
export type GeoRunJobState = z.infer<typeof GeoRunJobStateSchema>

const GeoRunJobSchema = z.object({
    kind: GeoRunJobKindSchema,
    state: GeoRunJobStateSchema,
})
export type GeoRunJob = z.infer<typeof GeoRunJobSchema>

const GeoRunStatePayloadSchema = z.object({
    isActive: z.boolean(),
    counts: z.object({
        active: z.number(),
        waiting: z.number(),
        delayed: z.number(),
        failed: z.number(),
        completed: z.number(),
    }),
    // BullMQ job ids on the wire are strings, but we only key by gameId
    // numerically. z.coerce.number() lets the JSON parse path recover when
    // either side serializes the key as a string.
    byGame: z.record(z.coerce.number(), z.array(GeoRunJobSchema)),
    globals: z.array(GeoRunJobSchema),
})
export type GeoRunStatePayload = z.infer<typeof GeoRunStatePayloadSchema>

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

export interface GeoRunPollingOptions {
    /**
     * When false, the hook stops scheduling new polls (e.g. the geo tab
     * is not the active admin tab, or the page is hidden). Already-armed
     * windows expire as normal. Defaults to true so existing call sites
     * keep their behavior.
     */
    enabled?: boolean
}

const DEFAULT_INTERVAL_MS = 2000
const ARM_FLOOR_MS = 5000

async function fetchState(): Promise<GeoRunStatePayload> {
    const res = await fetch('/api/admin/geo/run/state', { credentials: 'include' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.success) {
        throw new Error(json?.error?.code ?? `request failed: ${res.status}`)
    }
    const parsed = GeoRunStatePayloadSchema.safeParse(json.data)
    if (!parsed.success) throw new Error('run state shape mismatch')
    return parsed.data
}

/**
 * Poll while either:
 *  - the most recent response said `isActive=true`, or
 *  - `arm()` was called within the last `armWindowMs`.
 *
 * Stops on its own when both go false to avoid hammering the endpoint
 * during quiet periods. Pass `{ enabled: false }` to suspend polling
 * entirely (e.g. when the admin navigates away from the geo tab).
 */
export function useGeoRunPolling(
    intervalMs: number = DEFAULT_INTERVAL_MS,
    options: GeoRunPollingOptions = {},
): UseGeoRunPolling {
    const enabled = options.enabled ?? true
    // Page Visibility pause: when the browser tab goes to background we
    // stop scheduling polls. Without this, an admin who leaves the geo
    // panel open in a background tab keeps hitting /api/admin/geo/run/state
    // every 2s indefinitely.
    const [pageVisible, setPageVisible] = useState<boolean>(
        typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
    )
    useEffect(() => {
        if (typeof document === 'undefined') return undefined
        const onVis = () => setPageVisible(document.visibilityState !== 'hidden')
        document.addEventListener('visibilitychange', onVis)
        return () => document.removeEventListener('visibilitychange', onVis)
    }, [])
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
                // Surface a stable, parseable error code/message rather
                // than the raw stack — admins shouldn't see "TypeError: …"
                // strings in the toast.
                setError((e as { message?: string } | null)?.message ?? 'fetch failed')
            }
        }

        const shouldPoll = () =>
            enabled &&
            pageVisible &&
            (Date.now() < armedUntilRef.current || isActiveRef.current)

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
    }, [intervalMs, pollNonce, state?.isActive, enabled, pageVisible])

    const arm = useCallback((windowMs = ARM_FLOOR_MS) => {
        armedUntilRef.current = Date.now() + windowMs
        setPollNonce((n) => n + 1)
    }, [])

    return { state, error, arm }
}

// Helper: which tiers are currently in flight for a given game. Maps the
// per-source job kinds to the tier labels the maps tab already uses.
export type InFlightTier =
    | 'registry'
    | 'fandom'
    | 'strategywiki'
    | 'fextralife'
    | 'wand'
    | 'wikidata'
    | 'steam'
    | 'metadata'
    | 'tick'

export function tiersInFlightForGame(
    state: GeoRunStatePayload | null,
    gameId: number,
): Set<InFlightTier> {
    const out = new Set<InFlightTier>()
    const jobs = state?.byGame[gameId]
    if (!jobs) return out
    for (const job of jobs) {
        if (job.kind === 'import-registry-map') out.add('registry')
        else if (job.kind === 'import-fandom-map') out.add('fandom')
        else if (job.kind === 'import-strategywiki-map') out.add('strategywiki')
        else if (job.kind === 'import-fextralife-map') out.add('fextralife')
        else if (job.kind === 'import-wand-map') out.add('wand')
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
