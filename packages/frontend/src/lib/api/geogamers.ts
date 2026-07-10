import type {
    GeoGamersClaimResult,
    GeoGamersGuessGameResult,
    GeoGamersGuessLocationResult,
    GeoGamersRunView,
    GeoGamersSeasonMe,
    GeoGamersSeasonStanding,
    GeoPoint,
} from '@the-box/types'

export class GeoGamersApiError extends Error {
    constructor(
        public code: string,
        message: string,
        public status?: number,
    ) {
        super(message)
        this.name = 'GeoGamersApiError'
    }
}

interface ApiEnvelope<T> {
    success: boolean
    data: T
    error?: { code: string; message?: string }
}

export interface GeoGamersSeasonResponse {
    month: string
    players: number
    standings: GeoGamersSeasonStanding[]
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
        throw new GeoGamersApiError(
            json.error?.code ?? 'GEOGAMERS_REQUEST_FAILED',
            json.error?.message ?? `Request to ${path} failed`,
            res.status,
        )
    }
    return json.data
}

export const geoGamersApi = {
    startRun(): Promise<GeoGamersRunView> {
        return request<GeoGamersRunView>('/api/geogamers/run', { method: 'POST' })
    },

    getRun(runToken: string): Promise<GeoGamersRunView> {
        return request<GeoGamersRunView>(`/api/geogamers/run/${runToken}`)
    },

    guessGame(input: {
        runToken: string
        guess: string
        timeSpentMsDelta?: number
    }): Promise<GeoGamersGuessGameResult> {
        return request<GeoGamersGuessGameResult>('/api/geogamers/run/guess-game', {
            method: 'POST',
            body: JSON.stringify(input),
        })
    },

    guessLocation(input: {
        runToken: string
        geoMapId: number
        guess: GeoPoint
        timeSpentMsDelta?: number
    }): Promise<GeoGamersGuessLocationResult> {
        return request<GeoGamersGuessLocationResult>('/api/geogamers/run/guess-location', {
            method: 'POST',
            body: JSON.stringify(input),
        })
    },

    useJoker(runToken: string): Promise<GeoGamersRunView> {
        return request<GeoGamersRunView>('/api/geogamers/run/joker', {
            method: 'POST',
            body: JSON.stringify({ runToken }),
        })
    },

    claimRun(runToken: string): Promise<GeoGamersClaimResult> {
        return request<GeoGamersClaimResult>('/api/geogamers/run/claim', {
            method: 'POST',
            body: JSON.stringify({ runToken }),
        })
    },

    getSeason(): Promise<GeoGamersSeasonResponse> {
        return request<GeoGamersSeasonResponse>('/api/geogamers/season')
    },

    getSeasonMe(): Promise<GeoGamersSeasonMe | null> {
        return request<GeoGamersSeasonMe | null>('/api/geogamers/season/me')
    },
}
