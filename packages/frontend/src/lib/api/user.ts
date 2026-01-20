import type { User } from '@the-box/types'

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
}

export { UserApiError }
