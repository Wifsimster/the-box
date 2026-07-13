import type {
    GeoContributorStats,
    GeoContributorTier,
    GeoContributorTierThreshold,
    GeoFreePlayResult,
    GeoFreePlayView,
    GeoMap,
    GeoPinConfidence,
    GeoPlayableGame,
    GeoPoint,
    GeoScreenshotCandidate,
    GeoTodayStats,
} from '@the-box/types'

export class GeoApiError extends Error {
    constructor(
        public code: string,
        message: string,
        public status?: number,
    ) {
        super(message)
        this.name = 'GeoApiError'
    }
}

interface ApiEnvelope<T> {
    success: boolean
    data: T
    error?: { code: string; message?: string }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, {
        credentials: 'include',
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    })
    // Guard the parse: when the community geo surface is disabled
    // (GEO_COMMUNITY_ENABLED=false) the routes are unmounted and a request can
    // come back as a non-JSON body. Treat any unparseable body as a failure
    // instead of surfacing a raw parser error.
    let json: ApiEnvelope<T> | undefined
    try {
        json = (await res.json()) as ApiEnvelope<T>
    } catch {
        json = undefined
    }

    if (!res.ok || !json || !json.success) {
        // A 404 NOT_FOUND (routes unmounted) or a non-JSON body both mean the
        // community geo surface isn't available on this deployment — map them
        // to a single friendly, localized code. Endpoint-specific 404s carry
        // their own codes (CANDIDATE_NOT_FOUND, NO_FREE_PLAY_CANDIDATE, …) and
        // are passed through untouched.
        const unavailable =
            !json || (res.status === 404 && (json.error?.code ?? 'NOT_FOUND') === 'NOT_FOUND')
        throw new GeoApiError(
            unavailable
                ? 'GEO_COMMUNITY_DISABLED'
                : (json?.error?.code ?? 'GEO_REQUEST_FAILED'),
            json?.error?.message ?? `Request to ${path} failed`,
            res.status,
        )
    }
    return json.data
}

export interface GeoContributorUnlock {
    daysPlayed: number
    minRequired: number
    unlocked: boolean
}

export interface GeoContributorMe {
    stats: GeoContributorStats
    thresholds: GeoContributorTierThreshold[]
    computedTier: GeoContributorTier
    unlock: GeoContributorUnlock
}

export const geoApi = {
    pickContribution(
        gameId: number,
    ): Promise<{ candidate: GeoScreenshotCandidate; map: GeoMap }> {
        return request<{ candidate: GeoScreenshotCandidate; map: GeoMap }>(
            '/api/geo/contribute/pick',
            {
                method: 'POST',
                body: JSON.stringify({ gameId }),
            },
        )
    },

    submitPin(input: {
        geoScreenshotCandidateId: number
        pin: GeoPoint
        confidence?: GeoPinConfidence
    }): Promise<{ received: boolean }> {
        return request<{ received: boolean }>('/api/geo/contribute/pin', {
            method: 'POST',
            body: JSON.stringify(input),
        })
    },

    getContributorMe(): Promise<GeoContributorMe> {
        return request<GeoContributorMe>('/api/geo/contributor/me')
    },

    // ---- Free-play (unranked, all-games-all-maps browser) ----

    listPlayableGames(): Promise<GeoPlayableGame[]> {
        return request<GeoPlayableGame[]>('/api/geo/games')
    },

    listGameMaps(gameId: number): Promise<GeoMap[]> {
        return request<GeoMap[]>(`/api/geo/games/${gameId}/maps`)
    },

    getTodayStats(): Promise<GeoTodayStats> {
        return request<GeoTodayStats>('/api/geo/stats/today')
    },

    pickFreePlay(input: {
        gameId: number
        geoMapId?: number
        excludeMetaIds?: number[]
    }): Promise<GeoFreePlayView> {
        return request<GeoFreePlayView>('/api/geo/free-play/random', {
            method: 'POST',
            body: JSON.stringify(input),
        })
    },

    submitFreePlayGuess(input: {
        metaId: number
        geoMapId: number
        guess: GeoPoint
    }): Promise<GeoFreePlayResult> {
        return request<GeoFreePlayResult>('/api/geo/free-play/guess', {
            method: 'POST',
            body: JSON.stringify(input),
        })
    },
}
