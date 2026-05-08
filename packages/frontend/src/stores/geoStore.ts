import { create } from 'zustand'
import type {
    GeoMap,
    GeoPinConfidence,
    GeoPoint,
    GeoRewardedEvent,
    GeoScreenshotCandidate,
    GeoTierUpEvent,
} from '@the-box/types'
import { geoApi, type GeoContributorMe } from '../lib/api/geo'
import { getApiErrorMessage } from '../lib/api-errors'

type Phase = 'idle' | 'loading' | 'playing' | 'submitting' | 'error'

interface GeoState {
    phase: Phase
    errorMessage: string | null

    // Crowdsource flow
    currentCandidate: GeoScreenshotCandidate | null
    currentCandidateMap: GeoMap | null
    pendingPin: GeoPoint | null
    // Self-reported confidence on the pending pin (1=sure, 2=approx,
    // 3=guess). Optional — null means the player hasn't picked,
    // which the server treats as "sure".
    pendingConfidence: GeoPinConfidence | null

    // Contributor profile block
    contributor: GeoContributorMe | null

    // Realtime feed (latest-first; capped)
    recentRewards: GeoRewardedEvent[]
    latestTierUp: GeoTierUpEvent | null

    pickContribution: (gameId: number) => Promise<void>
    setPendingPin: (p: GeoPoint | null) => void
    setPendingConfidence: (c: GeoPinConfidence | null) => void
    submitPin: () => Promise<boolean>

    loadContributor: () => Promise<void>

    ingestRewardedEvent: (e: GeoRewardedEvent) => void
    ingestTierUpEvent: (e: GeoTierUpEvent) => void

    reset: () => void
}

const REWARD_BUFFER_MAX = 20

export const useGeoStore = create<GeoState>()((set, get) => ({
    phase: 'idle',
    errorMessage: null,
    currentCandidate: null,
    currentCandidateMap: null,
    pendingPin: null,
    pendingConfidence: null,
    contributor: null,
    recentRewards: [],
    latestTierUp: null,

    async pickContribution(gameId) {
        set({ phase: 'loading', errorMessage: null })
        try {
            const { candidate, map } = await geoApi.pickContribution(gameId)
            set({
                phase: 'playing',
                currentCandidate: candidate,
                currentCandidateMap: map,
                pendingPin: null,
                pendingConfidence: null,
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

    setPendingConfidence(c) {
        set({ pendingConfidence: c })
    },

    async submitPin() {
        const { currentCandidate, pendingPin, pendingConfidence } = get()
        if (!currentCandidate || !pendingPin) return false
        try {
            await geoApi.submitPin({
                geoScreenshotCandidateId: currentCandidate.id,
                pin: pendingPin,
                confidence: pendingConfidence ?? undefined,
            })
            set({
                pendingPin: null,
                pendingConfidence: null,
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
            errorMessage: null,
            currentCandidate: null,
            currentCandidateMap: null,
            pendingPin: null,
            pendingConfidence: null,
        })
    },
}))
