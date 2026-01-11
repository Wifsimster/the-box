import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Job, JobProgressEvent, Game, RecurringJob } from '@/types'
import { adminApi } from '@/lib/api'

interface GamesPagination {
  page: number
  limit: number
  total: number
}

interface GamesSort {
  field: string
  order: 'asc' | 'desc'
}

interface AdminState {
  // Jobs data
  jobs: Job[]
  isLoading: boolean
  error: string | null

  // Recurring jobs
  recurringJobs: RecurringJob[]

  // Stats
  stats: {
    waiting: number
    active: number
    completed: number
    failed: number
  } | null

  // Games data
  games: Game[]
  gamesLoading: boolean
  gamesError: string | null
  gamesPagination: GamesPagination
  gamesSearch: string
  gamesSort: GamesSort

  // Jobs Actions
  fetchJobs: () => Promise<void>
  fetchStats: () => Promise<void>
  fetchRecurringJobs: () => Promise<void>
  triggerSyncJob: () => Promise<void>
  triggerImportGames: (targetGames?: number, screenshotsPerGame?: number) => Promise<void>
  triggerImportScreenshots: () => Promise<void>
  createImportGamesJob: (targetGames?: number, screenshotsPerGame?: number, minMetacritic?: number) => Promise<Job>
  createImportScreenshotsJob: () => Promise<Job>
  cancelJob: (id: string) => Promise<void>
  clearCompleted: () => Promise<void>

  // Socket event handlers
  updateJobProgress: (event: JobProgressEvent) => void
  updateJobCompleted: (jobId: string, result: unknown) => void
  updateJobFailed: (jobId: string, error: string) => void

  // Games Actions
  fetchGames: (params?: { page?: number; search?: string }) => Promise<void>
  createGame: (data: Omit<Game, 'id'>) => Promise<Game>
  updateGame: (id: number, data: Partial<Omit<Game, 'id'>>) => Promise<Game>
  deleteGame: (id: number) => Promise<void>
  setGamesSearch: (search: string) => void
  setGamesSort: (field: string, order: 'asc' | 'desc') => void
  setGamesPage: (page: number) => void

  // Challenges
  rerollLoading: boolean
  rerollDailyChallenge: (date?: string) => Promise<void>
}

export const useAdminStore = create<AdminState>()(
  devtools(
    (set, get) => ({
      // Jobs initial state
      jobs: [],
      isLoading: false,
      error: null,
      recurringJobs: [],
      stats: null,

      // Games initial state
      games: [],
      gamesLoading: false,
      gamesError: null,
      gamesPagination: { page: 1, limit: 10, total: 0 },
      gamesSearch: '',
      gamesSort: { field: 'name', order: 'asc' },

      // Challenges initial state
      rerollLoading: false,

      fetchJobs: async () => {
        set({ isLoading: true, error: null })
        try {
          const { jobs } = await adminApi.listJobs()
          set({ jobs, isLoading: false })
        } catch (err) {
          set({ error: (err as Error).message, isLoading: false })
        }
      },

      fetchStats: async () => {
        try {
          const { stats } = await adminApi.getStats()
          set({ stats })
        } catch (err) {
          console.error('Failed to fetch stats:', err)
        }
      },

      fetchRecurringJobs: async () => {
        try {
          const { recurringJobs } = await adminApi.getRecurringJobs()
          set({ recurringJobs })
        } catch (err) {
          console.error('Failed to fetch recurring jobs:', err)
        }
      },
      triggerSyncJob: async () => {
        try {
          await adminApi.syncNewGames(10, 3)
          // Refresh job list after triggering
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to trigger sync job:', err)
          throw err
        }
      },

      triggerImportGames: async (targetGames, screenshotsPerGame) => {
        try {
          await adminApi.triggerImportGames(targetGames, screenshotsPerGame)
          // Refresh job list after triggering
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to trigger import games job:', err)
          throw err
        }
      },

      triggerImportScreenshots: async () => {
        try {
          await adminApi.triggerImportScreenshots()
          // Refresh job list after triggering
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to trigger import screenshots job:', err)
          throw err
        }
      },

      createImportGamesJob: async (targetGames, screenshotsPerGame, minMetacritic) => {
        set({ error: null })
        try {
          const { job } = await adminApi.importGames(targetGames, screenshotsPerGame, minMetacritic)
          set({ jobs: [job, ...get().jobs] })
          return job
        } catch (err) {
          set({ error: (err as Error).message })
          throw err
        }
      },

      createImportScreenshotsJob: async () => {
        set({ error: null })
        try {
          const { job } = await adminApi.importScreenshots()
          set({ jobs: [job, ...get().jobs] })
          return job
        } catch (err) {
          set({ error: (err as Error).message })
          throw err
        }
      },

      cancelJob: async (id) => {
        try {
          await adminApi.cancelJob(id)
          // Refresh jobs list
          get().fetchJobs()
        } catch (err) {
          set({ error: (err as Error).message })
        }
      },

      clearCompleted: async () => {
        try {
          await adminApi.clearCompleted()
          // Refresh jobs list
          get().fetchJobs()
        } catch (err) {
          set({ error: (err as Error).message })
        }
      },

      updateJobProgress: (event) => {
        set({
          jobs: get().jobs.map((j) =>
            j.id === event.jobId
              ? { ...j, progress: event.progress, status: 'active' as const }
              : j
          ),
        })
      },

      updateJobCompleted: (jobId, result) => {
        set({
          jobs: get().jobs.map((j) =>
            j.id === jobId
              ? {
                ...j,
                status: 'completed' as const,
                progress: 100,
                result: result as Job['result'],
                completedAt: new Date().toISOString(),
              }
              : j
          ),
        })
      },

      updateJobFailed: (jobId, error) => {
        set({
          jobs: get().jobs.map((j) =>
            j.id === jobId
              ? {
                ...j,
                status: 'failed' as const,
                error,
                failedAt: new Date().toISOString(),
              }
              : j
          ),
        })
      },

      // Games Actions
      fetchGames: async (params) => {
        const { gamesPagination, gamesSearch, gamesSort } = get()
        set({ gamesLoading: true, gamesError: null })
        try {
          const result = await adminApi.listGames({
            page: params?.page ?? gamesPagination.page,
            limit: gamesPagination.limit,
            search: params?.search ?? gamesSearch,
            sortBy: gamesSort.field,
            sortOrder: gamesSort.order,
          })
          set({
            games: result.games,
            gamesPagination: {
              page: result.page,
              limit: result.limit,
              total: result.total,
            },
            gamesLoading: false,
          })
        } catch (err) {
          set({ gamesError: (err as Error).message, gamesLoading: false })
        }
      },

      createGame: async (data) => {
        set({ gamesError: null })
        try {
          const { game } = await adminApi.createGame(data)
          // Refresh the list
          get().fetchGames()
          return game
        } catch (err) {
          set({ gamesError: (err as Error).message })
          throw err
        }
      },

      updateGame: async (id, data) => {
        set({ gamesError: null })
        try {
          const { game } = await adminApi.updateGame(id, data)
          // Refresh the list
          get().fetchGames()
          return game
        } catch (err) {
          set({ gamesError: (err as Error).message })
          throw err
        }
      },

      deleteGame: async (id) => {
        set({ gamesError: null })
        try {
          await adminApi.deleteGame(id)
          // Refresh the list
          get().fetchGames()
        } catch (err) {
          set({ gamesError: (err as Error).message })
          throw err
        }
      },

      setGamesSearch: (search) => {
        set({ gamesSearch: search })
      },

      setGamesSort: (field, order) => {
        set({ gamesSort: { field, order } })
        // Fetch with new sort
        get().fetchGames()
      },

      setGamesPage: (page) => {
        set({ gamesPagination: { ...get().gamesPagination, page } })
        // Fetch the new page
        get().fetchGames({ page })
      },

      // Challenges Actions
      rerollDailyChallenge: async (date?: string) => {
        set({ rerollLoading: true })
        try {
          await adminApi.rerollDailyChallenge(date)
        } catch (err) {
          console.error('Failed to reroll daily challenge:', err)
          throw err
        } finally {
          set({ rerollLoading: false })
        }
      },
    }),
    { name: 'AdminStore' }
  )
)
