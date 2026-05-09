interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

// Stable error codes the UI can branch on. The hook and the card both read
// `code` to pick the right localized toast — never compare error.message.
export type PushApiErrorCode =
  | 'NETWORK_ERROR'
  | 'SERVER_UNAVAILABLE'
  | 'PUSH_DEVICE_CAP_REACHED'
  | 'RATE_LIMITED'
  | 'PUSH_NOT_CONFIGURED'
  | 'UNKNOWN_ERROR'
  | string

export class PushApiError extends Error {
  code: PushApiErrorCode

  constructor(code: PushApiErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'PushApiError'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 503) {
    throw new PushApiError('SERVER_UNAVAILABLE', 'Push service is not configured')
  }
  if (response.status === 429) {
    throw new PushApiError('RATE_LIMITED', 'Too many requests; try again shortly')
  }
  let json: ApiResponse<T>
  try {
    json = (await response.json()) as ApiResponse<T>
  } catch {
    throw new PushApiError('UNKNOWN_ERROR', `Unexpected response (HTTP ${response.status})`)
  }
  if (!json.success || json.data === undefined) {
    throw new PushApiError(
      json.error?.code || 'UNKNOWN_ERROR',
      json.error?.message || 'An unexpected error occurred',
    )
  }
  return json.data
}

// fetch() throws TypeError on network failure / DNS / offline. Wrap so the
// caller sees a stable PushApiError code instead of having to sniff for it.
async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (err) {
    throw new PushApiError(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Network request failed',
    )
  }
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
    const response = await safeFetch('/api/push/vapid-public-key', { credentials: 'include' })
    if (response.status === 503) return null
    const data = await handleResponse<{ publicKey: string }>(response)
    return data.publicKey
  },

  async subscribe(payload: SubscribePayload): Promise<{ id: number; isActive: boolean }> {
    const response = await safeFetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return handleResponse<{ id: number; isActive: boolean }>(response)
  },

  async unsubscribe(endpoint: string): Promise<{ removed: boolean }> {
    const response = await safeFetch('/api/push/subscribe', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    })
    return handleResponse<{ removed: boolean }>(response)
  },
}
