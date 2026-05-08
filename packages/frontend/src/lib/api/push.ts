interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

export class PushApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'PushApiError'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiResponse<T>
  if (!json.success || json.data === undefined) {
    throw new PushApiError(
      json.error?.code || 'UNKNOWN_ERROR',
      json.error?.message || 'An unexpected error occurred',
    )
  }
  return json.data
}

export interface SubscribePayload {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

export const pushApi = {
  // Returns null when the server hasn't been issued VAPID keys yet (503 with
  // PUSH_NOT_CONFIGURED). The caller should hide the opt-in UI in that case
  // rather than treat it as a hard error.
  async getVapidPublicKey(): Promise<string | null> {
    const response = await fetch('/api/push/vapid-public-key', { credentials: 'include' })
    if (response.status === 503) return null
    const data = await handleResponse<{ publicKey: string }>(response)
    return data.publicKey
  },

  async subscribe(payload: SubscribePayload): Promise<{ id: number; isActive: boolean }> {
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return handleResponse<{ id: number; isActive: boolean }>(response)
  },

  async unsubscribe(endpoint: string): Promise<{ removed: boolean }> {
    const response = await fetch('/api/push/subscribe', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    })
    return handleResponse<{ removed: boolean }>(response)
  },
}
