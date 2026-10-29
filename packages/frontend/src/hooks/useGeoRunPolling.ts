import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

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
    byGame: z.record(z.coerce.number(), z.array(GeoRunJobSchema)),
    globals: z.array(GeoRunJobSchema),
})
export type GeoRunStatePayload = z.infer<typeof GeoRunStatePayloadSchema>

export interface UseGeoRunPolling {
    state: GeoRunStatePayload | null
    error: string | null
    arm: (windowMs?: number) => void
}

export interface GeoRunPollingOptions {
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

export function useGeoRunPolling(
    intervalMs: number = DEFAULT_INTERVAL_MS,
    options: GeoRunPollingOptions = {},
): UseGeoRunPolling {
    const enabled = options.enabled ?? true
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
    const armedUntilRef = useRef<number>(0)
    const isActiveRef = useRef<boolean>(false)
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
                setError((e as { message?: string } | null)?.message ?? 'fetch failed')
            }
        }

        const shouldPoll = () =>
            enabled &&
            pageVisible &&
            (Date.now() < armedUntilRef.current || isActiveRef.current)

        if (!shouldPoll()) return undefined

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
