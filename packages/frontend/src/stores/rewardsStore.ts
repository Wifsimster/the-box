import { create } from 'zustand'
import type { RewardGrant, RewardGrantedEvent } from '@the-box/types'
import { rewardsApi, RewardsApiError } from '@/lib/api/rewards'

interface RewardsState {
    /** Unclaimed rewards, newest first. Length drives the bell badge. */
    unclaimed: RewardGrant[]
    /** Initial fetch loading flag. */
    isLoading: boolean
    /** Per-grant claim flag so multiple cards can be claimed in parallel. */
    claiming: Record<string, boolean>
    /** Drawer open state. */
    isOpen: boolean

    fetchUnclaimed: () => Promise<void>
    claim: (rewardId: string) => Promise<RewardGrant | null>
    openInbox: () => void
    closeInbox: () => void
    /** Internal: prepend a grant arriving via Socket.io. */
    addGrant: (grant: RewardGrant) => void
    reset: () => void
}

export const useRewardsStore = create<RewardsState>((set) => ({
    unclaimed: [],
    isLoading: false,
    claiming: {},
    isOpen: false,

    fetchUnclaimed: async () => {
        set({ isLoading: true })
        try {
            const grants = await rewardsApi.listUnclaimed()
            set({ unclaimed: grants, isLoading: false })
        } catch (error) {
            console.error('Failed to fetch rewards:', error)
            set({ isLoading: false })
        }
    },

    claim: async (rewardId: string) => {
        set((s) => ({ claiming: { ...s.claiming, [rewardId]: true } }))
        try {
            const updated = await rewardsApi.claim(rewardId)
            set((s) => ({
                unclaimed: s.unclaimed.filter((g) => g.id !== rewardId),
                claiming: { ...s.claiming, [rewardId]: false },
            }))
            return updated
        } catch (error) {
            // NOT_UNLOCKED is a valid state (reactivation pre-play) — keep
            // the card visible and surface the message via console; the
            // component will read the error if needed in a future iteration.
            if (error instanceof RewardsApiError && error.code === 'NOT_UNLOCKED') {
                console.warn('reward not yet unlocked:', rewardId)
            } else {
                console.error('Failed to claim reward:', error)
            }
            set((s) => ({ claiming: { ...s.claiming, [rewardId]: false } }))
            return null
        }
    },

    openInbox: () => set({ isOpen: true }),
    closeInbox: () => set({ isOpen: false }),

    addGrant: (grant: RewardGrant) => {
        // Upsert by id. The same grant may arrive multiple times — once
        // when staged (`unlockedAt: null`) and again when unlocked
        // (`unlockedAt: ISO`). Replacing the existing entry lets the
        // card flip from "À débloquer" to "Réclamer" without a refetch.
        set((s) => {
            const idx = s.unclaimed.findIndex((g) => g.id === grant.id)
            if (idx >= 0) {
                const next = [...s.unclaimed]
                next[idx] = grant
                return { unclaimed: next }
            }
            return { unclaimed: [grant, ...s.unclaimed] }
        })
    },

    reset: () => set({
        unclaimed: [],
        isLoading: false,
        claiming: {},
        isOpen: false,
    }),
}))

/**
 * One-shot setup: subscribe the store to the `reward:granted` window event
 * dispatched by `notifications-socket.ts`. Idempotent — re-running is a
 * no-op. Called from `App.tsx` after auth is ready.
 */
let listenerWired = false
export function wireRewardsSocketListener(): void {
    if (listenerWired || typeof window === 'undefined') return
    window.addEventListener('reward:granted', ((event: Event) => {
        const detail = (event as CustomEvent<RewardGrantedEvent>).detail
        if (!detail) return
        // Translate the slim socket payload into a `RewardGrant` shape so
        // the store can render the card without an extra fetch round-trip.
        // userId is omitted on the client side (the socket already filters
        // by user:${userId} room) — the cards never read it.
        const grant: RewardGrant = {
            id: detail.rewardId,
            userId: '',
            source: detail.source,
            sourceRef: detail.sourceRef,
            payload: { items: detail.items },
            grantedAt: detail.grantedAt,
            unlockedAt: detail.unlockedAt,
            claimedAt: null,
        }
        useRewardsStore.getState().addGrant(grant)
    }) as EventListener)
    listenerWired = true
}
