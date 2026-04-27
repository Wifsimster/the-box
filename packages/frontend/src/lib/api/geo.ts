import type {
    GeoChallenge,
    GeoContributorStats,
    GeoContributorTier,
    GeoContributorTierThreshold,
    GeoGuessResult,
    GeoLeaderboardEntry,
    GeoMap,
    GeoPoint,
    GeoScreenshotCandidate,
    GeoScreenshotMeta,
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

export interface GeoDailyView {
    challenge: GeoChallenge
    meta: GeoScreenshotMeta
    candidate: GeoScreenshotCandidate
    map: GeoMap
    hasGuessed: boolean
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
    getCurrent(): Promise<GeoDailyView> {
        return request<GeoDailyView>('/api/geo/current')
    },

    getDaily(date: string): Promise<GeoDailyView> {
        return request<GeoDailyView>(`/api/geo/daily/${date}`)
    },

    getHistory(days = 7): Promise<GeoChallenge[]> {
        return request<GeoChallenge[]>(`/api/geo/history?days=${days}`)
    },

    submitGuess(input: {
        challengeId: number
        guess: GeoPoint
        durationMs?: number
    }): Promise<GeoGuessResult> {
        return request<GeoGuessResult>('/api/geo/guess', {
            method: 'POST',
            body: JSON.stringify(input),
        })
    },

    submitSkip(input: { challengeId: number }): Promise<{ skipped: boolean }> {
        return request<{ skipped: boolean }>('/api/geo/skip', {
            method: 'POST',
            body: JSON.stringify(input),
        })
    },

    leaderboardDaily(date: string): Promise<GeoLeaderboardEntry[]> {
        return request<GeoLeaderboardEntry[]>(`/api/geo/leaderboard/${date}`)
    },

    leaderboardMonthly(period: string): Promise<GeoLeaderboardEntry[]> {
        return request<GeoLeaderboardEntry[]>(`/api/geo/leaderboard/monthly/${period}`)
    },

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
}
