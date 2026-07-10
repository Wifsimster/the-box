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

    // Guard the parse: when the GeoGamers API is disabled the request 404s to
    // the SPA fallback and the body is HTML (`<!doctype …>`), not JSON. Blindly
    // calling res.json() there throws "Unexpected token '<'" and surfaces that
    // raw parser error to the player. Treat any unparseable body as a failure.
    let json: ApiEnvelope<T> | undefined
    try {
        json = (await res.json()) as ApiEnvelope<T>
    } catch {
        json = undefined
    }

    if (!res.ok || !json || !json.success) {
        // A 404 (feature disabled / route not mounted) or a non-JSON body both
        // mean GeoGamers isn't available on this deployment — map them to a
        // single friendly, localized code rather than leaking internals.
        const unavailable = res.status === 404 || !json
        throw new GeoGamersApiError(
            unavailable
                ? 'GEOGAMERS_UNAVAILABLE'
                : (json?.error?.code ?? 'GEOGAMERS_REQUEST_FAILED'),
            json?.error?.message ?? `Request to ${path} failed`,
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
