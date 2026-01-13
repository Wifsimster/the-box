import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Job, JobProgressEvent, Game, RecurringJob, ImportState, BatchImportProgressEvent, User } from '@/types'
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

interface UsersPagination {
  page: number
  limit: number
  total: number
  offset: number
}

interface UsersSort {
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
  triggerDailyChallengeJob: () => Promise<void>
  triggerSyncAllJob: () => Promise<void>
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

  // Full Import (Batch Processing)
  currentImport: ImportState | null
  fullImportLoading: boolean
  fullImportError: string | null
  fetchCurrentImport: () => Promise<void>
  startFullImport: (config?: {
    batchSize?: number
    screenshotsPerGame?: number
    minMetacritic?: number
  }) => Promise<ImportState>
  pauseFullImport: () => Promise<void>
  resumeFullImport: () => Promise<void>
  updateBatchImportProgress: (event: BatchImportProgressEvent) => void

  // Users data
  users: User[]
  usersLoading: boolean
  usersError: string | null
  usersPagination: UsersPagination
  usersSearch: string
  usersSort: UsersSort

  // Users Actions
  fetchUsers: (params?: { page?: number; search?: string }) => Promise<void>
  setUsersSearch: (search: string) => void
  setUsersSort: (field: string, order: 'asc' | 'desc') => void
  setUsersPage: (page: number) => void
  setUserRole: (userId: string, role: string | string[]) => Promise<void>
  banUser: (userId: string, reason?: string, banExpiresIn?: number) => Promise<void>
  unbanUser: (userId: string) => Promise<void>
  deleteUser: (userId: string) => Promise<void>
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

      // Full Import initial state
      currentImport: null,
      fullImportLoading: false,
      fullImportError: null,

      // Users initial state
      users: [],
      usersLoading: false,
      usersError: null,
      usersPagination: { page: 1, limit: 20, total: 0, offset: 0 },
      usersSearch: '',
      usersSort: { field: 'createdAt', order: 'desc' },

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

      triggerDailyChallengeJob: async () => {
        try {
          await adminApi.triggerDailyChallenge()
          // Refresh job list after triggering
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to trigger daily challenge job:', err)
          throw err
        }
      },

      triggerSyncAllJob: async () => {
        try {
          await adminApi.startSyncAll()
          // Refresh job list after triggering
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to trigger sync-all job:', err)
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

      // Full Import Actions
      fetchCurrentImport: async () => {
        try {
          const { importState } = await adminApi.getCurrentImport()
          set({ currentImport: importState })
        } catch (err) {
          console.error('Failed to fetch current import:', err)
        }
      },

      startFullImport: async (config) => {
        set({ fullImportLoading: true, fullImportError: null })
        try {
          const { importState } = await adminApi.startFullImport(config)
          set({ currentImport: importState, fullImportLoading: false })
          // Refresh jobs list
          get().fetchJobs()
          return importState
        } catch (err) {
          set({ fullImportError: (err as Error).message, fullImportLoading: false })
          throw err
        }
      },

      pauseFullImport: async () => {
        const { currentImport } = get()
        if (!currentImport) return

        set({ fullImportLoading: true, fullImportError: null })
        try {
          const { importState } = await adminApi.pauseFullImport(currentImport.id)
          set({ currentImport: importState, fullImportLoading: false })
        } catch (err) {
          set({ fullImportError: (err as Error).message, fullImportLoading: false })
          throw err
        }
      },

      resumeFullImport: async () => {
        const { currentImport } = get()
        if (!currentImport) return

        set({ fullImportLoading: true, fullImportError: null })
        try {
          const { importState } = await adminApi.resumeFullImport(currentImport.id)
          set({ currentImport: importState, fullImportLoading: false })
          // Refresh jobs list
          get().fetchJobs()
        } catch (err) {
          set({ fullImportError: (err as Error).message, fullImportLoading: false })
          throw err
        }
      },

      updateBatchImportProgress: (event) => {
        const { currentImport } = get()
        if (currentImport && currentImport.id === event.importStateId) {
          set({
            currentImport: {
              ...currentImport,
              gamesProcessed: event.current,
              gamesImported: event.gamesImported,
              gamesSkipped: event.gamesSkipped,
              screenshotsDownloaded: event.screenshotsDownloaded,
              currentBatch: event.currentBatch,
              totalGamesAvailable: event.totalGamesAvailable,
              totalBatchesEstimated: event.totalBatches,
            },
          })
        }
      },

      // Users Actions
      fetchUsers: async (params) => {
        const { usersPagination, usersSearch, usersSort } = get()
        const page = params?.page ?? usersPagination.page
        const limit = usersPagination.limit
        const offset = (page - 1) * limit

        set({ usersLoading: true, usersError: null })
        try {
          const result = await adminApi.listUsers({
            limit,
            offset,
            searchValue: (params?.search ?? usersSearch) || undefined,
            searchField: 'email',
            searchOperator: 'contains',
            sortBy: usersSort.field,
            sortDirection: usersSort.order,
          })
          // Transform users to ensure isAdmin is correctly set from role field
          // Better-auth returns users with a 'role' field, but our User type uses 'isAdmin'
          const transformedUsers = result.users.map((user: any) => {
            // Check both role field (from better-auth) and isAdmin field
            const isAdmin = user.role === 'admin' || user.isAdmin === true
            return {
              ...user,
              isAdmin,
            }
          })
          set({
            users: transformedUsers,
            usersPagination: {
              page,
              limit,
              total: result.total,
              offset: result.offset ?? offset,
            },
            usersLoading: false,
          })
        } catch (err) {
          set({ usersError: (err as Error).message, usersLoading: false })
        }
      },

      setUsersSearch: (search) => {
        set({ usersSearch: search })
      },

      setUsersSort: (field, order) => {
        set({ usersSort: { field, order } })
        // Fetch with new sort
        get().fetchUsers()
      },

      setUsersPage: (page) => {
        set({ usersPagination: { ...get().usersPagination, page } })
        // Fetch the new page
        get().fetchUsers({ page })
      },

      setUserRole: async (userId, role) => {
        set({ usersError: null })
        try {
          await adminApi.setUserRole(userId, role)
          // Refresh the list
          get().fetchUsers()
        } catch (err) {
          set({ usersError: (err as Error).message })
          throw err
        }
      },

      banUser: async (userId, reason, banExpiresIn) => {
        set({ usersError: null })
        try {
          await adminApi.banUser(userId, reason, banExpiresIn)
          // Refresh the list
          get().fetchUsers()
        } catch (err) {
          set({ usersError: (err as Error).message })
          throw err
        }
      },

      unbanUser: async (userId) => {
        set({ usersError: null })
        try {
          await adminApi.unbanUser(userId)
          // Refresh the list
          get().fetchUsers()
        } catch (err) {
          set({ usersError: (err as Error).message })
          throw err
        }
      },

      deleteUser: async (userId) => {
        set({ usersError: null })
        try {
          await adminApi.deleteUser(userId)
          // Refresh the list
          get().fetchUsers()
        } catch (err) {
          set({ usersError: (err as Error).message })
          throw err
        }
      },
    }),
    { name: 'AdminStore' }
  )
)
