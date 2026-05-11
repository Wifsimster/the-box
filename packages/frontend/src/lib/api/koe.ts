export const koeApi = {
    /**
     * Fetch the HMAC identity hash for the signed-in user, used by the
     * Koe widget to prove the caller is who they claim to be. Returns null
     * when the backend hasn't been configured with KOE_IDENTITY_SECRET
     * (HTTP 204) — the widget then runs in unverified mode.
     */
    async getIdentity(): Promise<string | null> {
        const response = await fetch('/api/koe/identity', {
            credentials: 'include',
        })

        if (response.status === 204) return null
        if (!response.ok) return null

        const json = await response.json()
        return json?.data?.userHash ?? null
    },
}
