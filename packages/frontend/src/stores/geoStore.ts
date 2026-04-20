import { create } from 'zustand'
import type {
    GeoChallenge,
    GeoGuessResult,
    GeoLeaderboardEntry,
    GeoMap,
    GeoPoint,
    GeoRewardedEvent,
    GeoScreenshotCandidate,
    GeoScreenshotMeta,
    GeoTierUpEvent,
} from '@the-box/types'
import { geoApi, GeoApiError, type GeoContributorMe } from '../lib/api/geo'

type Phase = 'idle' | 'loading' | 'playing' | 'submitting' | 'result' | 'error'

interface GeoState {
    // Daily challenge flow
    phase: Phase
    challenge: GeoChallenge | null
    meta: GeoScreenshotMeta | null
    candidate: GeoScreenshotCandidate | null
    map: GeoMap | null
    hasGuessed: boolean
    pendingGuess: GeoPoint | null
    result: GeoGuessResult | null
    errorMessage: string | null

    // Leaderboards
    leaderboardDaily: GeoLeaderboardEntry[]
    leaderboardMonthly: GeoLeaderboardEntry[]

    // Crowdsource flow
    currentCandidate: GeoScreenshotCandidate | null
    currentCandidateMap: GeoMap | null
    pendingPin: GeoPoint | null

    // Contributor profile block
    contributor: GeoContributorMe | null

    // Realtime feed (latest-first; capped)
    recentRewards: GeoRewardedEvent[]
    latestTierUp: GeoTierUpEvent | null

    // Actions
    loadDaily: (date: string) => Promise<void>
    setPendingGuess: (p: GeoPoint | null) => void
    submitGuess: (durationMs?: number) => Promise<GeoGuessResult | null>
    loadLeaderboardDaily: (date: string) => Promise<void>
    loadLeaderboardMonthly: (period: string) => Promise<void>

    pickContribution: (gameId: number) => Promise<void>
    setPendingPin: (p: GeoPoint | null) => void
    submitPin: () => Promise<boolean>

    loadContributor: () => Promise<void>

    ingestRewardedEvent: (e: GeoRewardedEvent) => void
    ingestTierUpEvent: (e: GeoTierUpEvent) => void

    reset: () => void
}

const REWARD_BUFFER_MAX = 20

export const useGeoStore = create<GeoState>((set, get) => ({
    phase: 'idle',
    challenge: null,
    meta: null,
    candidate: null,
    map: null,
    hasGuessed: false,
    pendingGuess: null,
    result: null,
    errorMessage: null,
    leaderboardDaily: [],
    leaderboardMonthly: [],
    currentCandidate: null,
    currentCandidateMap: null,
    pendingPin: null,
    contributor: null,
    recentRewards: [],
    latestTierUp: null,

    async loadDaily(date) {
        set({ phase: 'loading', errorMessage: null })
        try {
            const view = await geoApi.getDaily(date)
            set({
                phase: 'playing',
                challenge: view.challenge,
                meta: view.meta,
                candidate: view.candidate,
                map: view.map,
                hasGuessed: view.hasGuessed,
                result: null,
                pendingGuess: null,
            })
        } catch (err) {
            set({
                phase: 'error',
                errorMessage: err instanceof GeoApiError ? err.message : 'Failed to load challenge',
            })
        }
    },

    setPendingGuess(p) {
        set({ pendingGuess: p })
    },

    async submitGuess(durationMs) {
        const { challenge, pendingGuess } = get()
        if (!challenge || !pendingGuess) return null

        set({ phase: 'submitting', errorMessage: null })
        try {
            const result = await geoApi.submitGuess({
                challengeId: challenge.id,
                guess: pendingGuess,
                durationMs,
            })
            set({ phase: 'result', result, hasGuessed: true })
            return result
        } catch (err) {
            set({
                phase: 'error',
                errorMessage:
                    err instanceof GeoApiError ? err.message : 'Failed to submit guess',
            })
            return null
        }
    },

    async loadLeaderboardDaily(date) {
        const rows = await geoApi.leaderboardDaily(date)
        set({ leaderboardDaily: rows })
    },

    async loadLeaderboardMonthly(period) {
        const rows = await geoApi.leaderboardMonthly(period)
        set({ leaderboardMonthly: rows })
    },

    async pickContribution(gameId) {
        set({ phase: 'loading', errorMessage: null })
        try {
            const { candidate, map } = await geoApi.pickContribution(gameId)
            set({
                phase: 'playing',
                currentCandidate: candidate,
                currentCandidateMap: map,
                pendingPin: null,
            })
        } catch (err) {
            set({
                phase: 'error',
                errorMessage:
                    err instanceof GeoApiError
                        ? err.code === 'CONTRIBUTE_RATE_LIMIT'
                            ? 'Hourly pin limit reached — come back later.'
                            : err.message
                        : 'Failed to load a candidate',
            })
        }
    },

    setPendingPin(p) {
        set({ pendingPin: p })
    },

    async submitPin() {
        const { currentCandidate, pendingPin } = get()
        if (!currentCandidate || !pendingPin) return false
        try {
            await geoApi.submitPin({
                geoScreenshotCandidateId: currentCandidate.id,
                pin: pendingPin,
            })
            set({
                pendingPin: null,
                currentCandidate: null,
                currentCandidateMap: null,
                phase: 'idle',
            })
            return true
        } catch (err) {
            set({
                errorMessage:
                    err instanceof GeoApiError ? err.message : 'Failed to submit pin',
            })
            return false
        }
    },

    async loadContributor() {
        try {
            const data = await geoApi.getContributorMe()
            set({ contributor: data })
        } catch {
            // Silent: the profile card degrades to the no-stats placeholder.
        }
    },

    ingestRewardedEvent(e) {
        set((s) => ({
            recentRewards: [e, ...s.recentRewards].slice(0, REWARD_BUFFER_MAX),
        }))
    },

    ingestTierUpEvent(e) {
        set({ latestTierUp: e })
        // Optimistic: bump the stored tier immediately; the next contributor
        // fetch will reconcile canonical data.
        const current = get().contributor
        if (current) {
            set({
                contributor: {
                    ...current,
                    stats: { ...current.stats, tier: e.newTier },
                    computedTier: e.newTier,
                },
            })
        }
    },

    reset() {
        set({
            phase: 'idle',
            challenge: null,
            meta: null,
            candidate: null,
            map: null,
            hasGuessed: false,
            pendingGuess: null,
            result: null,
            errorMessage: null,
            currentCandidate: null,
            currentCandidateMap: null,
            pendingPin: null,
        })
    },
}))
