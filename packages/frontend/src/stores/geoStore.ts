import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
import { getApiErrorMessage } from '../lib/api-errors'
import i18n from '../lib/i18n'

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
    errorCode: string | null

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

export const useGeoStore = create<GeoState>()(
    persist(
        (set, get) => ({
    phase: 'idle',
    challenge: null,
    meta: null,
    candidate: null,
    map: null,
    hasGuessed: false,
    pendingGuess: null,
    result: null,
    errorMessage: null,
    errorCode: null,
    leaderboardDaily: [],
    leaderboardMonthly: [],
    currentCandidate: null,
    currentCandidateMap: null,
    pendingPin: null,
    contributor: null,
    recentRewards: [],
    latestTierUp: null,

    async loadDaily(date) {
        // Snapshot what was rehydrated (or held in memory) before we kick off
        // the fetch — needed so we can restore the player's score after a
        // page reload or a route round-trip.
        const prev = get()
        set({ phase: 'loading', errorMessage: null, errorCode: null })
        try {
            const view = await geoApi.getDaily(date)
            // Survive reload: if the backend says "you already guessed" AND
            // we have a persisted result for this exact challenge, restore
            // the result phase instead of dropping the player back to a
            // fresh playing state. The challenge.id guard makes day-to-day
            // store rollover safe — yesterday's result is ignored.
            const restored =
                view.hasGuessed &&
                prev.result !== null &&
                prev.challenge !== null &&
                prev.challenge.id === view.challenge.id
            set({
                phase: restored ? 'result' : 'playing',
                challenge: view.challenge,
                meta: view.meta,
                candidate: view.candidate,
                map: view.map,
                hasGuessed: view.hasGuessed,
                result: restored ? prev.result : null,
                pendingGuess: restored ? prev.pendingGuess : null,
            })
        } catch (err) {
            set({
                phase: 'error',
                errorMessage: getApiErrorMessage(err, i18n.t('apiErrors.default')),
                errorCode: err instanceof GeoApiError ? err.code : null,
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
                errorMessage: getApiErrorMessage(err),
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
                errorMessage: getApiErrorMessage(err),
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
                errorMessage: getApiErrorMessage(err),
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
            errorCode: null,
            currentCandidate: null,
            currentCandidateMap: null,
            pendingPin: null,
        })
    },
        }),
        {
            name: 'geo-daily-store',
            // Only persist what's needed to survive a reload during the
            // daily-game result phase. Skipping leaderboards / contributor
            // / live event buffers keeps localStorage small and avoids
            // resurrecting stale realtime data on a fresh tab.
            partialize: (state) => ({
                challenge: state.challenge,
                result: state.result,
                hasGuessed: state.hasGuessed,
                pendingGuess: state.pendingGuess,
            }),
        },
    ),
)
