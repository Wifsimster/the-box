import { create } from 'zustand'
import type { RewardGrant, RewardGrantedEvent } from '@the-box/types'
import { rewardsApi, RewardsApiError } from '@/lib/api/rewards'

interface RewardsState {
    unclaimed: RewardGrant[]
    isLoading: boolean
    claiming: Record<string, boolean>
    isOpen: boolean

    fetchUnclaimed: () => Promise<void>
    claim: (rewardId: string) => Promise<RewardGrant | null>
    openInbox: () => void
    closeInbox: () => void
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

let listenerWired = false
export function wireRewardsSocketListener(): void {
    if (listenerWired || typeof window === 'undefined') return
    window.addEventListener('reward:granted', ((event: Event) => {
        const detail = (event as CustomEvent<RewardGrantedEvent>).detail
        if (!detail) return
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
