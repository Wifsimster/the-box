import type { Job, JobType, JobData, JobListResponse, Game, RecurringJob, Screenshot, ImportState, User } from '@/types'

// Games API types
export interface GamesListParams {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface GamesListResponse {
  games: Game[]
  total: number
  page: number
  limit: number
}

// Users API types
export interface UsersListParams {
  limit?: number
  offset?: number
  searchValue?: string
  searchField?: 'email' | 'name'
  searchOperator?: 'contains' | 'starts_with' | 'ends_with'
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  filterField?: string
  filterValue?: string | number | boolean
  filterOperator?: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte'
}

export interface UsersListResponse {
  users: User[]
  total: number
  limit?: number
  offset?: number
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

export class AdminApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'AdminApiError'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const json: ApiResponse<T> = await response.json()

  if (!json.success || !json.data) {
    throw new AdminApiError(
      json.error?.code || 'UNKNOWN_ERROR',
      json.error?.message || 'An unexpected error occurred'
    )
  }

  return json.data
}

export const adminApi = {
  /**
   * List all jobs
   */
  async listJobs(): Promise<JobListResponse> {
    const response = await fetch('/api/admin/jobs', {
      credentials: 'include',
    })
    return handleResponse<JobListResponse>(response)
  },

  /**
   * Get a specific job
   */
  async getJob(id: string): Promise<{ job: Job }> {
    const response = await fetch(`/api/admin/jobs/${id}`, {
      credentials: 'include',
    })
    return handleResponse<{ job: Job }>(response)
  },

  /**
   * Create a generic job
   */
  async createJob(type: JobType, data?: JobData): Promise<{ job: Job }> {
    const response = await fetch('/api/admin/jobs', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, data }),
    })
    return handleResponse<{ job: Job }>(response)
  },

  /**
   * Cancel a job
   */
  async cancelJob(id: string): Promise<{ cancelled: boolean }> {
    const response = await fetch(`/api/admin/jobs/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    return handleResponse<{ cancelled: boolean }>(response)
  },

  /**
   * Start import games job
   */
  async importGames(targetGames?: number, screenshotsPerGame?: number, minMetacritic?: number): Promise<{ job: Job }> {
    const response = await fetch('/api/admin/jobs/import-games', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetGames, screenshotsPerGame, minMetacritic }),
    })
    return handleResponse<{ job: Job }>(response)
  },

  /**
   * Start import screenshots job
   */
  async importScreenshots(): Promise<{ job: Job }> {
    const response = await fetch('/api/admin/jobs/import-screenshots', {
      method: 'POST',
      credentials: 'include',
    })
    return handleResponse<{ job: Job }>(response)
  },

  /**
   * Start create daily challenge job (manual trigger)
   */
  async triggerDailyChallenge(): Promise<{ job: Job }> {
    const response = await fetch('/api/admin/jobs/create-daily-challenge', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return handleResponse<{ job: Job }>(response)
  },

  /**
   * Start cleanup-anonymous-users job (manual trigger)
   */
  async triggerCleanupAnonymousUsers(): Promise<{ job: Job }> {
    const response = await fetch('/api/admin/jobs/cleanup-anonymous-users', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return handleResponse<{ job: Job }>(response)
  },

  /**
   * Start clear-daily-data job (manual trigger)
   */
  async triggerClearDailyData(): Promise<{ job: Job }> {
    const response = await fetch('/api/admin/jobs/clear-daily-data', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return handleResponse<{ job: Job }>(response)
  },

  /**
   * Start sync-all-games job (manual trigger)
   */
  async startSyncAll(config?: {
    batchSize?: number
    screenshotsPerGame?: number
    minMetacritic?: number
    updateExistingMetadata?: boolean
  }): Promise<{ syncState: ImportState; job: { id: string; name: string } }> {
    const response = await fetch('/api/admin/jobs/sync-all/start', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config || {}),
    })
    return handleResponse<{ syncState: ImportState; job: { id: string; name: string } }>(response)
  },

  /**
   * Manually trigger import games job
   */
  async triggerImportGames(targetGames?: number, screenshotsPerGame?: number): Promise<{ job: Job }> {
    const response = await fetch('/api/admin/jobs/import-games/trigger', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetGames, screenshotsPerGame }),
    })
    return handleResponse<{ job: Job }>(response)
  },

  /**
   * Manually trigger import screenshots job
   */
  async triggerImportScreenshots(): Promise<{ job: Job }> {
    const response = await fetch('/api/admin/jobs/import-screenshots/trigger', {
      method: 'POST',
      credentials: 'include',
    })
    return handleResponse<{ job: Job }>(response)
  },

  /**
   * Get queue stats
   */
  async getStats(): Promise<{
    stats: { waiting: number; active: number; completed: number; failed: number }
  }> {
    const response = await fetch('/api/admin/jobs/stats', {
      credentials: 'include',
    })
    return handleResponse<{
      stats: { waiting: number; active: number; completed: number; failed: number }
    }>(response)
  },

  /**
   * Get recurring jobs info (scheduled jobs)
   */
  async getRecurringJobs(): Promise<{ recurringJobs: RecurringJob[] }> {
    const response = await fetch('/api/admin/jobs/recurring', {
      credentials: 'include',
    })
    return handleResponse<{ recurringJobs: RecurringJob[] }>(response)
  },

  /**
   * Clear completed jobs
   */
  async clearCompleted(): Promise<{ cleared: number }> {
    const response = await fetch('/api/admin/jobs/completed', {
      method: 'DELETE',
      credentials: 'include',
    })
    return handleResponse<{ cleared: number }>(response)
  },

  // ============================================
  // Games Management
  // ============================================

  /**
   * List all games with pagination and search
   */
  async listGames(params?: GamesListParams): Promise<GamesListResponse> {
    const queryParams = new URLSearchParams()
    if (params?.page) queryParams.set('page', String(params.page))
    if (params?.limit) queryParams.set('limit', String(params.limit))
    if (params?.search) queryParams.set('search', params.search)
    if (params?.sortBy) queryParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) queryParams.set('sortOrder', params.sortOrder)

    const queryString = queryParams.toString()
    const url = `/api/admin/games${queryString ? `?${queryString}` : ''}`

    const response = await fetch(url, {
      credentials: 'include',
    })
    return handleResponse<GamesListResponse>(response)
  },

  /**
   * Get a specific game by ID
   */
  async getGame(id: number): Promise<{ game: Game }> {
    const response = await fetch(`/api/admin/games/${id}`, {
      credentials: 'include',
    })
    return handleResponse<{ game: Game }>(response)
  },

  /**
   * Create a new game
   */
  async createGame(data: Omit<Game, 'id'>): Promise<{ game: Game }> {
    const response = await fetch('/api/admin/games', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    return handleResponse<{ game: Game }>(response)
  },

  /**
   * Update an existing game
   */
  async updateGame(id: number, data: Partial<Omit<Game, 'id'>>): Promise<{ game: Game }> {
    const response = await fetch(`/api/admin/games/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    return handleResponse<{ game: Game }>(response)
  },

  /**
   * Delete a game
   */
  async deleteGame(id: number): Promise<{ deleted: boolean }> {
    const response = await fetch(`/api/admin/games/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    return handleResponse<{ deleted: boolean }>(response)
  },

  /**
   * Sync a game's metadata from RAWG API
   */
  async syncGameFromRawg(id: number): Promise<{ game: Game }> {
    const response = await fetch(`/api/admin/games/${id}/sync-rawg`, {
      method: 'POST',
      credentials: 'include',
    })
    return handleResponse<{ game: Game }>(response)
  },

  /**
   * Get screenshots for a specific game
   */
  async getGameScreenshots(gameId: number): Promise<{ screenshots: Screenshot[] }> {
    const response = await fetch(`/api/admin/games/${gameId}/screenshots`, {
      credentials: 'include',
    })
    return handleResponse<{ screenshots: Screenshot[] }>(response)
  },

  // ============================================
  // Challenges Management
  // ============================================

  /**
   * Reroll a daily challenge's screenshots
   * Replaces the 10 screenshots with new random ones
   */
  async rerollDailyChallenge(date?: string, minMetacritic?: number): Promise<{
    challengeId: number
    date: string
    newScreenshotCount: number
  }> {
    const response = await fetch('/api/admin/challenges/reroll', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date, minMetacritic }),
    })
    return handleResponse<{
      challengeId: number
      date: string
      newScreenshotCount: number
    }>(response)
  },

  /**
   * Reset admin's own daily session (allows replaying the challenge)
   */
  async resetMyDailySession(date?: string): Promise<{
    challengeId: number
    date: string
    deleted: boolean
  }> {
    const response = await fetch('/api/admin/challenges/reset-session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date }),
    })
    return handleResponse<{
      challengeId: number
      date: string
      deleted: boolean
    }>(response)
  },

  // ============================================
  // Full Import (Batch Processing)
  // ============================================

  /**
   * Start a full import of all high-quality games from RAWG
   */
  async startFullImport(config?: {
    batchSize?: number
    screenshotsPerGame?: number
    minMetacritic?: number
  }): Promise<{ importState: ImportState; job: { id: string; name: string } }> {
    const response = await fetch('/api/admin/jobs/full-import/start', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config || {}),
    })
    return handleResponse<{ importState: ImportState; job: { id: string; name: string } }>(response)
  },

  /**
   * Get the current active import state
   */
  async getCurrentImport(): Promise<{ importState: ImportState | null }> {
    const response = await fetch('/api/admin/jobs/full-import/current', {
      credentials: 'include',
    })
    return handleResponse<{ importState: ImportState | null }>(response)
  },

  /**
   * Get import state by ID
   */
  async getImportState(id: number): Promise<{ importState: ImportState }> {
    const response = await fetch(`/api/admin/jobs/full-import/${id}`, {
      credentials: 'include',
    })
    return handleResponse<{ importState: ImportState }>(response)
  },

  /**
   * Pause an ongoing full import
   */
  async pauseFullImport(id: number): Promise<{ importState: ImportState }> {
    const response = await fetch(`/api/admin/jobs/full-import/${id}/pause`, {
      method: 'POST',
      credentials: 'include',
    })
    return handleResponse<{ importState: ImportState }>(response)
  },

  /**
   * Resume a paused full import
   */
  async resumeFullImport(id: number): Promise<{ importState: ImportState; job: { id: string; name: string } }> {
    const response = await fetch(`/api/admin/jobs/full-import/${id}/resume`, {
      method: 'POST',
      credentials: 'include',
    })
    return handleResponse<{ importState: ImportState; job: { id: string; name: string } }>(response)
  },

  // ============================================
  // Recalculate Scores
  // ============================================

  /**
   * Start a score recalculation job
   */
  async startRecalculateScores(config?: {
    batchSize?: number
    dryRun?: boolean
    startDate?: string
    endDate?: string
  }): Promise<{ recalculateState: ImportState; job: { id: string; name: string } }> {
    const response = await fetch('/api/admin/jobs/recalculate-scores/start', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config || {}),
    })
    return handleResponse<{ recalculateState: ImportState; job: { id: string; name: string } }>(response)
  },

  /**
   * Get the current active recalculation state
   */
  async getCurrentRecalculateScores(): Promise<{ recalculateState: ImportState | null }> {
    const response = await fetch('/api/admin/jobs/recalculate-scores/current', {
      credentials: 'include',
    })
    return handleResponse<{ recalculateState: ImportState | null }>(response)
  },

  /**
   * Get recalculation state by ID
   */
  async getRecalculateScoresState(id: number): Promise<{ recalculateState: ImportState }> {
    const response = await fetch(`/api/admin/jobs/recalculate-scores/${id}`, {
      credentials: 'include',
    })
    return handleResponse<{ recalculateState: ImportState }>(response)
  },

  /**
   * Pause an ongoing score recalculation
   */
  async pauseRecalculateScores(id: number): Promise<{ recalculateState: ImportState }> {
    const response = await fetch(`/api/admin/jobs/recalculate-scores/${id}/pause`, {
      method: 'POST',
      credentials: 'include',
    })
    return handleResponse<{ recalculateState: ImportState }>(response)
  },

  /**
   * Resume a paused score recalculation
   */
  async resumeRecalculateScores(id: number): Promise<{ recalculateState: ImportState; job: { id: string; name: string } }> {
    const response = await fetch(`/api/admin/jobs/recalculate-scores/${id}/resume`, {
      method: 'POST',
      credentials: 'include',
    })
    return handleResponse<{ recalculateState: ImportState; job: { id: string; name: string } }>(response)
  },

  // ============================================
  // User Management
  // ============================================

  /**
   * List all users with pagination, search, filter, and sort
   */
  async listUsers(params?: UsersListParams): Promise<UsersListResponse> {
    const queryParams = new URLSearchParams()
    if (params?.limit !== undefined) queryParams.set('limit', String(params.limit))
    if (params?.offset !== undefined) queryParams.set('offset', String(params.offset))
    if (params?.searchValue) queryParams.set('searchValue', params.searchValue)
    if (params?.searchField) queryParams.set('searchField', params.searchField)
    if (params?.searchOperator) queryParams.set('searchOperator', params.searchOperator)
    if (params?.sortBy) queryParams.set('sortBy', params.sortBy)
    if (params?.sortDirection) queryParams.set('sortDirection', params.sortDirection)
    if (params?.filterField) queryParams.set('filterField', params.filterField)
    if (params?.filterValue !== undefined) queryParams.set('filterValue', String(params.filterValue))
    if (params?.filterOperator) queryParams.set('filterOperator', params.filterOperator)

    const queryString = queryParams.toString()
    const url = `/api/auth/admin/list-users${queryString ? `?${queryString}` : ''}`

    const response = await fetch(url, {
      credentials: 'include',
    })

    // Better-auth returns data directly, not wrapped in { success, data }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch users' }))
      throw new AdminApiError(
        error.code || 'UNKNOWN_ERROR',
        error.message || 'An unexpected error occurred'
      )
    }

    const data = await response.json()
    return data
  },

  /**
   * Set user role
   */
  async setUserRole(userId: string, role: string | string[]): Promise<{ user: User }> {
    const response = await fetch('/api/auth/admin/set-role', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, role }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to set user role' }))
      throw new AdminApiError(
        error.code || 'UNKNOWN_ERROR',
        error.message || 'An unexpected error occurred'
      )
    }

    const data = await response.json()
    return data
  },

  /**
   * Ban a user
   */
  async banUser(userId: string, reason?: string, banExpiresIn?: number): Promise<{ user: User }> {
    const response = await fetch('/api/auth/admin/ban-user', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, banReason: reason, banExpiresIn }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to ban user' }))
      throw new AdminApiError(
        error.code || 'UNKNOWN_ERROR',
        error.message || 'An unexpected error occurred'
      )
    }

    const data = await response.json()
    return data
  },

  /**
   * Unban a user
   */
  async unbanUser(userId: string): Promise<{ user: User }> {
    const response = await fetch('/api/auth/admin/unban-user', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to unban user' }))
      throw new AdminApiError(
        error.code || 'UNKNOWN_ERROR',
        error.message || 'An unexpected error occurred'
      )
    }

    const data = await response.json()
    return data
  },

  /**
   * Delete a user
   */
  async deleteUser(userId: string): Promise<{ deleted: boolean }> {
    const response = await fetch('/api/auth/admin/delete-user', {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete user' }))
      throw new AdminApiError(
        error.code || 'UNKNOWN_ERROR',
        error.message || 'An unexpected error occurred'
      )
    }

    const data = await response.json()
    return data
  },

  /**
   * Create a new user (optional for future use)
   */
  async createUser(data: {
    email: string
    password: string
    name: string
    role?: string | string[]
    emailVerified?: boolean
  }): Promise<{ newUser: User }> {
    const response = await fetch('/api/auth/admin/create-user', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create user' }))
      throw new AdminApiError(
        error.code || 'UNKNOWN_ERROR',
        error.message || 'An unexpected error occurred'
      )
    }

    const data_response = await response.json()
    return data_response
  },

  /**
   * Get email configuration status
   */
  async getEmailConfig(): Promise<{
    configured: boolean
    hasApiKey: boolean
    emailFrom: string
  }> {
    const response = await fetch('/api/admin/email/config', {
      credentials: 'include',
    })
    return handleResponse<{
      configured: boolean
      hasApiKey: boolean
      emailFrom: string
    }>(response)
  },

  /**
   * Send test email to specified email address or current admin user
   */
  async testEmail(email?: string): Promise<{ sent: boolean; to: string }> {
    const response = await fetch('/api/admin/email/test', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(email ? { email } : {}),
    })
    return handleResponse<{ sent: boolean; to: string }>(response)
  },
}
