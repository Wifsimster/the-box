import { create } from 'zustand'
import type {
    DailyLoginStatus,
    ClaimRewardResponse,
    UserInventory,
} from '@the-box/types'

interface DailyLoginState {
    status: DailyLoginStatus | null

    inventory: UserInventory | null

    isLoading: boolean
    isClaiming: boolean

    isModalOpen: boolean
    justClaimed: ClaimRewardResponse | null

    fetchStatus: (userRole?: string) => Promise<void>
    fetchInventory: () => Promise<void>
    claimReward: () => Promise<ClaimRewardResponse | null>
    openModal: () => void
    closeModal: () => void
    clearJustClaimed: () => void
    reset: () => void
}

export const useDailyLoginStore = create<DailyLoginState>((set, get) => ({
    status: null,
    inventory: null,
    isLoading: false,
    isClaiming: false,
    isModalOpen: false,
    justClaimed: null,

    fetchStatus: async (userRole?: string) => {
        set({ isLoading: true })
        try {
            const response = await fetch('/api/daily-login/status', {
                credentials: 'include',
            })

            if (!response.ok) {
                throw new Error('Failed to fetch daily login status')
            }

            const json = await response.json()
            set({ status: json.data, isLoading: false })

            void userRole
        } catch (error) {
            console.error('Failed to fetch daily login status:', error)
            set({ isLoading: false })
        }
    },

    fetchInventory: async () => {
        try {
            const response = await fetch('/api/inventory', {
                credentials: 'include',
            })

            if (!response.ok) {
                throw new Error('Failed to fetch inventory')
            }

            const json = await response.json()
            set({ inventory: json.data })
        } catch (error) {
            console.error('Failed to fetch inventory:', error)
        }
    },

    claimReward: async () => {
        set({ isClaiming: true })
        try {
            const response = await fetch('/api/daily-login/claim', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            })

            if (!response.ok) {
                const json = await response.json()
                throw new Error(json.error?.message || 'Failed to claim reward')
            }

            const json = await response.json()
            const claimResponse = json.data as ClaimRewardResponse

            const currentStatus = get().status
            if (currentStatus) {
                set({
                    status: {
                        ...currentStatus,
                        canClaim: false,
                        hasClaimedToday: true,
                        currentStreak: claimResponse.newStreak,
                    },
                })
            }

            set({
                justClaimed: claimResponse,
                inventory: claimResponse.inventory,
                isClaiming: false,
            })

            return claimResponse
        } catch (error) {
            console.error('Failed to claim reward:', error)
            set({ isClaiming: false })
            return null
        }
    },

    openModal: () => set({ isModalOpen: true }),

    closeModal: () => set({ isModalOpen: false }),

    clearJustClaimed: () => set({ justClaimed: null }),

    reset: () => set({
        status: null,
        inventory: null,
        isLoading: false,
        isClaiming: false,
        isModalOpen: false,
        justClaimed: null,
    }),
}))
