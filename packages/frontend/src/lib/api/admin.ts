import type { Job, JobType, JobData, JobListResponse, Game, RecurringJob } from '@/types'

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
  async importGames(targetGames?: number, screenshotsPerGame?: number): Promise<{ job: Job }> {
    const response = await fetch('/api/admin/jobs/import-games', {
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
}
