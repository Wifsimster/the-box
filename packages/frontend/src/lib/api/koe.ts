export const koeApi = {
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
