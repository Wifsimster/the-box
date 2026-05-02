import type {
    GeoContributorStats,
    GeoContributorTier,
    GeoContributorTierThreshold,
    GeoFreePlayResult,
    GeoFreePlayView,
    GeoMap,
    GeoPlayableGame,
    GeoPoint,
    GeoScreenshotCandidate,
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
    const json = (await res.json()) as ApiEnvelope<T>
    if (!res.ok || !json.success) {
        throw new GeoApiError(
            json.error?.code ?? 'GEO_REQUEST_FAILED',
            json.error?.message ?? `Request to ${path} failed`,
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

    pickFreePlay(input: {
        gameId: number
        geoMapId?: number
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
