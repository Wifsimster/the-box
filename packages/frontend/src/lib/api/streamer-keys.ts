import type { ApiKeyCreated, ApiKeySummary } from '@the-box/types'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message?: string }
}

export class StreamerKeysApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'StreamerKeysApiError'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiResponse<T>
  if (!json.success || json.data === undefined) {
    throw new StreamerKeysApiError(
      json.error?.code || 'UNKNOWN_ERROR',
      json.error?.message || 'Streamer Kit request failed'
    )
  }
  return json.data
}

export interface StreamerSettingsResponse {
  publicProfileEnabled: boolean
  publicSlug: string | null
  keys: ApiKeySummary[]
}

export const streamerKeysApi = {
  async getSettings(): Promise<StreamerSettingsResponse> {
    const res = await fetch('/api/streamer-keys/me', { credentials: 'include' })
    return handleResponse<StreamerSettingsResponse>(res)
  },

  async updateSettings(input: {
    publicProfileEnabled: boolean
    publicSlug?: string | null
  }): Promise<{ ok: true }> {
    const res = await fetch('/api/streamer-keys/settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return handleResponse(res)
  },

  async createKey(label: string, mode: 'live' | 'test' = 'live'): Promise<ApiKeyCreated> {
    const res = await fetch('/api/streamer-keys', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, mode }),
    })
    return handleResponse<ApiKeyCreated>(res)
  },

  async revokeKey(id: number): Promise<{ ok: true }> {
    const res = await fetch(`/api/streamer-keys/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    return handleResponse(res)
  },
}
