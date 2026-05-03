import type { AdvancedStats, User } from '@the-box/types'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

class UserApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'UserApiError'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const json: ApiResponse<T> = await response.json()

  if (!json.success || !json.data) {
    throw new UserApiError(
      json.error?.code || 'UNKNOWN_ERROR',
      json.error?.message || 'An unexpected error occurred'
    )
  }

  return json.data
}

export const userApi = {
  /**
   * Get current user profile
   */
  async getProfile(): Promise<User> {
    const response = await fetch('/api/users/me', {
      credentials: 'include',
    })
    return handleResponse<User>(response)
  },

  /**
   * Upload avatar image
   */
  async uploadAvatar(file: File): Promise<User> {
    const formData = new FormData()
    formData.append('avatar', file)

    const response = await fetch('/api/user/avatar', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    return handleResponse<User>(response)
  },

  /**
   * Delete avatar image
   */
  async deleteAvatar(): Promise<User> {
    const response = await fetch('/api/user/avatar', {
      method: 'DELETE',
      credentials: 'include',
    })
    return handleResponse<User>(response)
  },

  /**
   * Update email marketing consent (opt-in / opt-out).
   */
  async updateEmailConsent(consent: boolean): Promise<User> {
    const response = await fetch('/api/user/email-consent', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent }),
    })
    return handleResponse<User>(response)
  },

  // Premium-only. Resolves with a typed payload on 200; the caller is
  // responsible for hiding the panel for free users so we never see a
  // 402 here in practice — but if we do, handleResponse throws a
  // PREMIUM_REQUIRED UserApiError the panel can swallow.
  async getAdvancedStats(): Promise<AdvancedStats> {
    const response = await fetch('/api/user/advanced-stats', {
      credentials: 'include',
    })
    return handleResponse<AdvancedStats>(response)
  },

  // Free users can only set `default`; premium themes 402 server-side.
  // Returns the updated User so callers can refresh local state without
  // a follow-up GET /me.
  async updateTheme(theme: string): Promise<User> {
    const response = await fetch('/api/user/theme', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    })
    return handleResponse<User>(response)
  },
}

export { UserApiError }
