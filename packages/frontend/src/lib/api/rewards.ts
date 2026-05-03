import type { RewardGrant } from '@the-box/types'

export class RewardsApiError extends Error {
    constructor(
        public code: string,
        message: string
    ) {
        super(message)
        this.name = 'RewardsApiError'
    }
}

export const rewardsApi = {
    /**
     * List unclaimed rewards for the current user, newest first. Used by
     * the inbox drawer + as the reconciliation source on socket reconnect.
     */
    async listUnclaimed(): Promise<RewardGrant[]> {
        const response = await fetch('/api/rewards/unclaimed', {
            credentials: 'include',
        })

        if (!response.ok) {
            const json = await response.json().catch(() => ({}))
            throw new RewardsApiError(
                json.error?.code || 'FETCH_ERROR',
                json.error?.message || 'Failed to fetch rewards'
            )
        }

        const json = await response.json()
        return json.data
    },

    /**
     * Claim a single reward by id. Idempotent on the server side: re-claim
     * returns the existing row. Returns the updated grant on success; throws
     * with `code === 'NOT_UNLOCKED'` when the grant is staged but not yet
     * unlockable (e.g. reactivation chest before first guess).
     */
    async claim(rewardId: string): Promise<RewardGrant> {
        const response = await fetch(`/api/rewards/${rewardId}/claim`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        })

        const json = await response.json().catch(() => ({}))

        if (!response.ok) {
            throw new RewardsApiError(
                json.error?.code || 'CLAIM_ERROR',
                json.error?.message || 'Failed to claim reward'
            )
        }

        return json.data
    },
}
