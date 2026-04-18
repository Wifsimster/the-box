export class ReferralApiError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'ReferralApiError'
  }
}

export interface ReferralClaimResult {
  rewards: Array<{ itemType: string; itemKey: string; quantity: number }>
  referrerId: string
}

export const referralApi = {
  async claim(code: string): Promise<ReferralClaimResult> {
    const response = await fetch('/api/referral/claim', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })

    const json = await response.json()
    if (!response.ok) {
      throw new ReferralApiError(
        json.error?.code || 'CLAIM_ERROR',
        json.error?.message || 'Failed to claim referral'
      )
    }
    return json.data
  },
}
