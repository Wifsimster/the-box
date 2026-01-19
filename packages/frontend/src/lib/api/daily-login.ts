import type { DailyLoginStatus, ClaimRewardResponse, DailyReward, UserInventory } from '@the-box/types'

export class DailyLoginApiError extends Error {
    constructor(
        public code: string,
        message: string
    ) {
        super(message)
        this.name = 'DailyLoginApiError'
    }
}

export const dailyLoginApi = {
    /**
     * Get current user's daily login status
     */
    async getStatus(): Promise<DailyLoginStatus> {
        const response = await fetch('/api/daily-login/status', {
            credentials: 'include',
        })

        if (!response.ok) {
            const json = await response.json()
            throw new DailyLoginApiError(
                json.error?.code || 'FETCH_ERROR',
                json.error?.message || 'Failed to fetch daily login status'
            )
        }

        const json = await response.json()
        return json.data
    },

    /**
     * Claim today's reward
     */
    async claimReward(): Promise<ClaimRewardResponse> {
        const response = await fetch('/api/daily-login/claim', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        })

        if (!response.ok) {
            const json = await response.json()
            throw new DailyLoginApiError(
                json.error?.code || 'CLAIM_ERROR',
                json.error?.message || 'Failed to claim reward'
            )
        }

        const json = await response.json()
        return json.data
    },

    /**
     * Get all reward definitions
     */
    async getAllRewards(): Promise<DailyReward[]> {
        const response = await fetch('/api/daily-login/rewards', {
            credentials: 'include',
        })

        if (!response.ok) {
            const json = await response.json()
            throw new DailyLoginApiError(
                json.error?.code || 'FETCH_ERROR',
                json.error?.message || 'Failed to fetch rewards'
            )
        }

        const json = await response.json()
        return json.data
    },

    /**
     * Get current user's inventory
     */
    async getInventory(): Promise<UserInventory> {
        const response = await fetch('/api/inventory', {
            credentials: 'include',
        })

        if (!response.ok) {
            const json = await response.json()
            throw new DailyLoginApiError(
                json.error?.code || 'FETCH_ERROR',
                json.error?.message || 'Failed to fetch inventory'
            )
        }

        const json = await response.json()
        return json.data
    },
}
