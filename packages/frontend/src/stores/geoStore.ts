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

type Phase =
    | 'idle'
    | 'loading'
    | 'playing'
    | 'submitting'
    | 'result'
    | 'skipped'
    | 'error'

interface GeoState {
    // Daily challenge flow
    phase: Phase
    challenge: GeoChallenge | null
    meta: GeoScreenshotMeta | null
    candidate: GeoScreenshotCandidate | null
    // Multi-map: every enabled map the player can pick from. The
    // chooser renders these; the canvas renders whichever
    // `selectedMapId` references. For single-map games this is a
    // length-1 array and the only id is auto-selected at load time.
    maps: GeoMap[]
    selectedMapId: number | null
    // The canonical map of the screenshot. Only populated after the
    // result reveal. Reused for the "correct map" highlight + reveal banner.
    correctMap: GeoMap | null
    hasGuessed: boolean
    pendingGuess: GeoPoint | null
    result: GeoGuessResult | null
    // Sticky flag for "player skipped this challenge" so a reload during
    // the skipped phase can restore the SkipResultBlock without resurrecting
    // a (non-existent) score. Cleared whenever a new challenge loads.
    wasSkipped: boolean
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
    loadCurrent: () => Promise<void>
    loadDaily: (date: string) => Promise<void>
    selectMap: (mapId: number) => void
    setPendingGuess: (p: GeoPoint | null) => void
    submitGuess: (durationMs?: number) => Promise<GeoGuessResult | null>
    skipChallenge: () => Promise<boolean>
    loadNextUnplayed: () => Promise<boolean>
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

// Shared loader for both `loadCurrent` and `loadDaily`. Snapshots the
// store before kicking off the fetch so we can restore the player's
// score after a reload or route round-trip — keyed on `challenge.id`,
// so a rotation to a new challenge correctly drops yesterday's result.
async function loadView(
    get: () => GeoState,
    set: (partial: Partial<GeoState>) => void,
    fetcher: () => Promise<{
        challenge: GeoChallenge
        meta: GeoScreenshotMeta
        candidate: GeoScreenshotCandidate
        maps: GeoMap[]
        map?: GeoMap
        hasGuessed: boolean
    }>,
): Promise<void> {
    const prev = get()
    set({ phase: 'loading', errorMessage: null, errorCode: null })
    try {
        const view = await fetcher()
        const sameChallenge =
            prev.challenge !== null && prev.challenge.id === view.challenge.id
        const restoredResult = view.hasGuessed && sameChallenge && prev.result !== null
        const restoredSkip = view.hasGuessed && sameChallenge && prev.wasSkipped
        // Single-map games auto-select so the chooser feels invisible —
        // a reload mid-result also restores the previously selected map
        // when the challenge is the same.
        const autoSelect =
            view.maps.length === 1
                ? view.maps[0]?.id ?? null
                : sameChallenge
                  ? prev.selectedMapId
                  : null
        set({
            phase: restoredResult ? 'result' : restoredSkip ? 'skipped' : 'playing',
            challenge: view.challenge,
            meta: view.meta,
            candidate: view.candidate,
            maps: view.maps,
            selectedMapId: autoSelect,
            correctMap: view.map ?? null,
            hasGuessed: view.hasGuessed,
            result: restoredResult ? prev.result : null,
            wasSkipped: restoredSkip,
            pendingGuess: restoredResult ? prev.pendingGuess : null,
        })
    } catch (err) {
        set({
            phase: 'error',
            errorMessage: getApiErrorMessage(err, i18n.t('apiErrors.default')),
            errorCode: err instanceof GeoApiError ? err.code : null,
        })
    }
}

export const useGeoStore = create<GeoState>()(
    persist(
        (set, get) => ({
    phase: 'idle',
    challenge: null,
    meta: null,
    candidate: null,
    maps: [],
    selectedMapId: null,
    correctMap: null,
    hasGuessed: false,
    pendingGuess: null,
    result: null,
    wasSkipped: false,
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

    async loadCurrent() {
        await loadView(get, set, () => geoApi.getCurrent())
    },

    async loadDaily(date) {
        await loadView(get, set, () => geoApi.getDaily(date))
    },

    selectMap(mapId) {
        // Pin coordinates are normalized [0..1] per map — switching the
        // selected map invalidates the previous pin. Clearing it forces
        // the player to re-pin, which matches the visual: the canvas
        // image swaps under them.
        set({ selectedMapId: mapId, pendingGuess: null })
    },

    setPendingGuess(p) {
        set({ pendingGuess: p })
    },

    async submitGuess(durationMs) {
        const { challenge, pendingGuess, selectedMapId, maps } = get()
        if (!challenge || !pendingGuess) return null
        // Multi-map games require an explicit pick. Single-map games
        // would have auto-selected at load time, so a null here is
        // genuinely a UI bug rather than a missing pick.
        if (selectedMapId == null && maps.length > 1) return null

        set({ phase: 'submitting', errorMessage: null })
        try {
            const result = await geoApi.submitGuess({
                challengeId: challenge.id,
                geoMapId: selectedMapId ?? undefined,
                guess: pendingGuess,
                durationMs,
            })
            // Resolve the canonical map locally for the reveal — server
            // also sends `correctMapId` on the result, so we just look
            // up the matching `GeoMap` from the chooser list.
            const correctMap =
                result.correctMapId != null
                    ? maps.find((m) => m.id === result.correctMapId) ?? null
                    : null
            set({
                phase: 'result',
                result,
                hasGuessed: true,
                wasSkipped: false,
                correctMap,
            })
            return result
        } catch (err) {
            set({
                phase: 'error',
                errorMessage: getApiErrorMessage(err),
            })
            return null
        }
    },

    async skipChallenge() {
        const { challenge } = get()
        if (!challenge) return false

        set({ phase: 'submitting', errorMessage: null })
        try {
            await geoApi.submitSkip({ challengeId: challenge.id })
            set({
                phase: 'skipped',
                hasGuessed: true,
                wasSkipped: true,
                result: null,
                pendingGuess: null,
            })
            return true
        } catch (err) {
            set({
                phase: 'error',
                errorMessage: getApiErrorMessage(err),
            })
            return false
        }
    },

    async loadNextUnplayed() {
        // Pull the catch-up window and pick the most recent challenge
        // the player hasn't yet guessed or skipped. Excludes the
        // current challenge so the CTA doesn't loop the player back to
        // the screen they just finished.
        const { challenge: currentChallenge } = get()
        try {
            const history = await geoApi.getHistory(7)
            const next = history.find(
                (c) => !c.hasGuessed && c.id !== currentChallenge?.id,
            )
            if (!next) {
                set({
                    phase: 'error',
                    errorCode: 'NO_NEXT_UNPLAYED',
                    errorMessage: i18n.t(
                        'geo.daily.next.exhausted',
                        "You've played every recent geo challenge.",
                    ),
                })
                return false
            }
            await loadView(get, set, () => geoApi.getDaily(next.challengeDate))
            return true
        } catch (err) {
            set({
                phase: 'error',
                errorMessage: getApiErrorMessage(err),
                errorCode: err instanceof GeoApiError ? err.code : null,
            })
            return false
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
            maps: [],
            selectedMapId: null,
            correctMap: null,
            hasGuessed: false,
            pendingGuess: null,
            result: null,
            wasSkipped: false,
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
                wasSkipped: state.wasSkipped,
                // Persist the selected map so a reload mid-result doesn't
                // bounce the user back to "pick a map" before showing
                // their score.
                selectedMapId: state.selectedMapId,
            }),
        },
    ),
)
