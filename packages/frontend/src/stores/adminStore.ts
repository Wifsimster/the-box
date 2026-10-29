import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Job, Game, RecurringJob, ImportState, User, BillingEntitlement } from '@/types'
import { adminApi } from '@/lib/api'
import { getAdminSocket, connectAdminSocket, disconnectAdminSocket } from '@/lib/socket'

interface JobProgressEvent {
  jobId: string
  progress: number
  message?: string
}

interface BatchImportProgressEvent {
  importStateId: number
  progress: number
  status: string
  message?: string
  current: number
  gamesImported: number
  gamesSkipped: number
  screenshotsDownloaded: number
  currentBatch: number
  totalGamesAvailable: number
  totalBatches: number
}

interface RecalculateScoresProgressEvent {
  recalculateStateId: number
  progress: number
  status: string
  message?: string
  current: number
  total: number
  sessionsProcessed: number
  sessionsUpdated: number
  sessionsSkipped: number
  totalScoreChanges: number
  currentBatch: number
  totalBatches: number | null
  dryRun: boolean
}

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
  jobs: Job[]
  isLoading: boolean
  error: string | null

  recurringJobs: RecurringJob[]

  stats: {
    waiting: number
    active: number
    completed: number
    failed: number
  } | null

  games: Game[]
  gamesLoading: boolean
  gamesError: string | null
  gamesPagination: GamesPagination
  gamesSearch: string
  gamesSort: GamesSort

  fetchJobs: () => Promise<void>
  fetchStats: () => Promise<void>
  fetchRecurringJobs: () => Promise<void>
  triggerDailyChallengeJob: () => Promise<void>
  triggerSyncAllJob: () => Promise<void>
  cancelActiveSyncAll: () => Promise<void>
  triggerCleanupAnonymousUsersJob: () => Promise<void>
  triggerClearDailyDataJob: () => Promise<void>
  triggerRefreshGameAliasesJob: () => Promise<void>
  triggerImportGames: (targetGames?: number, screenshotsPerGame?: number) => Promise<void>
  triggerImportScreenshots: () => Promise<void>
  createImportGamesJob: (targetGames?: number, screenshotsPerGame?: number, minMetacritic?: number) => Promise<Job>
  createImportScreenshotsJob: () => Promise<Job>
  cancelJob: (id: string) => Promise<void>
  clearCompleted: () => Promise<void>

  updateJobProgress: (event: JobProgressEvent) => void
  updateJobCompleted: (jobId: string, result: unknown) => void
  updateJobFailed: (jobId: string, error: string) => void
  handleJobAdded: (jobId: string) => void
  handleJobActive: (jobId: string) => void
  handleJobDelayed: (jobId: string, delay: number) => void
  handleJobWaiting: (jobId: string) => void
  handleJobRemoved: (jobId: string) => void
  handleJobStalled: (jobId: string) => void

  connectSocket: () => void
  disconnectSocket: () => void

  fetchGames: (params?: { page?: number; search?: string }) => Promise<void>
  createGame: (data: Omit<Game, 'id'>) => Promise<Game>
  updateGame: (id: number, data: Partial<Omit<Game, 'id'>>) => Promise<Game>
  deleteGame: (id: number) => Promise<void>
  setGamesSearch: (search: string) => void
  setGamesSort: (field: string, order: 'asc' | 'desc') => void
  setGamesPage: (page: number) => void

  rerollLoading: boolean
  rerollDailyChallenge: (date?: string, minMetacritic?: number) => Promise<void>

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

  currentRecalculateScores: ImportState | null
  recalculateScoresLoading: boolean
  recalculateScoresError: string | null
  fetchCurrentRecalculateScores: () => Promise<void>
  startRecalculateScores: (config?: {
    batchSize?: number
    dryRun?: boolean
    startDate?: string
    endDate?: string
  }) => Promise<ImportState>
  pauseRecalculateScores: () => Promise<void>
  resumeRecalculateScores: () => Promise<void>
  updateRecalculateScoresProgress: (event: RecalculateScoresProgressEvent) => void

  users: User[]
  usersLoading: boolean
  usersError: string | null
  usersPagination: UsersPagination
  usersSearch: string
  usersSort: UsersSort
  usersBilling: Record<string, BillingEntitlement>

  fetchUsers: (params?: { page?: number; search?: string }) => Promise<void>
  setUsersSearch: (search: string) => void
  setUsersSort: (field: string, order: 'asc' | 'desc') => void
  setUsersPage: (page: number) => void
  setUserRole: (userId: string, role: string | string[]) => Promise<void>
  banUser: (userId: string, reason?: string, banExpiresIn?: number) => Promise<void>
  unbanUser: (userId: string) => Promise<void>
  deleteUser: (userId: string) => Promise<void>
  grantSupporter: (userId: string) => Promise<void>
  revokeSupporter: (userId: string) => Promise<void>
}

export const useAdminStore = create<AdminState>()(
  devtools(
    (set, get) => ({
      jobs: [],
      isLoading: false,
      error: null,
      recurringJobs: [],
      stats: null,

      games: [],
      gamesLoading: false,
      gamesError: null,
      gamesPagination: { page: 1, limit: 10, total: 0 },
      gamesSearch: '',
      gamesSort: { field: 'name', order: 'asc' },

      rerollLoading: false,

      currentImport: null,
      fullImportLoading: false,
      fullImportError: null,

      currentRecalculateScores: null,
      recalculateScoresLoading: false,
      recalculateScoresError: null,

      users: [],
      usersLoading: false,
      usersError: null,
      usersPagination: { page: 1, limit: 20, total: 0, offset: 0 },
      usersSearch: '',
      usersSort: { field: 'createdAt', order: 'desc' },
      usersBilling: {},

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
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to trigger daily challenge job:', err)
          throw err
        }
      },

      triggerSyncAllJob: async () => {
        try {
          await adminApi.startSyncAll()
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to trigger sync-all job:', err)
          throw err
        }
      },

      cancelActiveSyncAll: async () => {
        try {
          const { syncState } = await adminApi.getActiveSyncAll()
          if (!syncState) {
            throw new Error('No active sync-all job found')
          }
          await adminApi.cancelSyncAll(syncState.id)
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to cancel sync-all job:', err)
          throw err
        }
      },

      triggerCleanupAnonymousUsersJob: async () => {
        try {
          await adminApi.triggerCleanupAnonymousUsers()
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to trigger cleanup anonymous users job:', err)
          throw err
        }
      },

      triggerClearDailyDataJob: async () => {
        try {
          await adminApi.triggerClearDailyData()
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to trigger clear daily data job:', err)
          throw err
        }
      },

      triggerRefreshGameAliasesJob: async () => {
        try {
          await adminApi.triggerRefreshGameAliases()
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to trigger refresh game aliases job:', err)
          throw err
        }
      },

      triggerImportGames: async (targetGames, screenshotsPerGame) => {
        try {
          await adminApi.triggerImportGames(targetGames, screenshotsPerGame)
          get().fetchJobs()
        } catch (err) {
          console.error('Failed to trigger import games job:', err)
          throw err
        }
      },

      triggerImportScreenshots: async () => {
        try {
          await adminApi.triggerImportScreenshots()
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
          set({
            jobs: get().jobs.filter((j) => j.id !== id),
          })

          await adminApi.cancelJob(id)
          get().fetchJobs()
        } catch (err) {
          set({ error: (err as Error).message })
          get().fetchJobs()
        }
      },

      clearCompleted: async () => {
        try {
          await adminApi.clearCompleted()
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
        get().fetchRecurringJobs()
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
        get().fetchRecurringJobs()
      },

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
        get().fetchGames()
      },

      setGamesPage: (page) => {
        set({ gamesPagination: { ...get().gamesPagination, page } })
        get().fetchGames({ page })
      },

      rerollDailyChallenge: async (date?: string, minMetacritic?: number) => {
        set({ rerollLoading: true })
        try {
          await adminApi.rerollDailyChallenge(date, minMetacritic)
        } catch (err) {
          console.error('Failed to reroll daily challenge:', err)
          throw err
        } finally {
          set({ rerollLoading: false })
        }
      },

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

      updateRecalculateScoresProgress: (event) => {
        const { currentRecalculateScores } = get()
        if (currentRecalculateScores && currentRecalculateScores.id === event.recalculateStateId) {
          set({
            currentRecalculateScores: {
              ...currentRecalculateScores,
            },
          })
        }
      },

      fetchCurrentRecalculateScores: async () => {
        try {
          const { recalculateState } = await adminApi.getCurrentRecalculateScores()
          set({ currentRecalculateScores: recalculateState })
        } catch (err) {
          console.error('Failed to fetch current recalculation state:', err)
        }
      },

      startRecalculateScores: async (config) => {
        set({ recalculateScoresLoading: true, recalculateScoresError: null })
        try {
          const { recalculateState } = await adminApi.startRecalculateScores(config)
          set({ currentRecalculateScores: recalculateState, recalculateScoresLoading: false })
          get().fetchJobs()
          return recalculateState
        } catch (err) {
          set({ recalculateScoresError: (err as Error).message, recalculateScoresLoading: false })
          throw err
        }
      },

      pauseRecalculateScores: async () => {
        const { currentRecalculateScores } = get()
        if (!currentRecalculateScores) return

        set({ recalculateScoresLoading: true, recalculateScoresError: null })
        try {
          const { recalculateState } = await adminApi.pauseRecalculateScores(currentRecalculateScores.id)
          set({ currentRecalculateScores: recalculateState, recalculateScoresLoading: false })
        } catch (err) {
          set({ recalculateScoresError: (err as Error).message, recalculateScoresLoading: false })
          throw err
        }
      },

      resumeRecalculateScores: async () => {
        const { currentRecalculateScores } = get()
        if (!currentRecalculateScores) return

        set({ recalculateScoresLoading: true, recalculateScoresError: null })
        try {
          const { recalculateState } = await adminApi.resumeRecalculateScores(currentRecalculateScores.id)
          set({ currentRecalculateScores: recalculateState, recalculateScoresLoading: false })
          get().fetchJobs()
        } catch (err) {
          set({ recalculateScoresError: (err as Error).message, recalculateScoresLoading: false })
          throw err
        }
      },

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Backend response typing varies
          const transformedUsers = result.users.map((user: any) => {
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

          const ids = transformedUsers.flatMap((u) => (u.id ? [u.id] : []))
          if (ids.length > 0) {
            try {
              const entitlements = await adminApi.getUsersBilling(ids)
              set({ usersBilling: { ...get().usersBilling, ...entitlements } })
            } catch {
            }
          }
        } catch (err) {
          set({ usersError: (err as Error).message, usersLoading: false })
        }
      },

      setUsersSearch: (search) => {
        set({ usersSearch: search })
      },

      setUsersSort: (field, order) => {
        set({ usersSort: { field, order } })
        get().fetchUsers()
      },

      setUsersPage: (page) => {
        set({ usersPagination: { ...get().usersPagination, page } })
        get().fetchUsers({ page })
      },

      setUserRole: async (userId, role) => {
        set({ usersError: null })
        try {
          await adminApi.setUserRole(userId, role)
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
          get().fetchUsers()
        } catch (err) {
          set({ usersError: (err as Error).message })
          throw err
        }
      },

      grantSupporter: async (userId) => {
        set({ usersError: null })
        try {
          const { entitlement } = await adminApi.grantSupporter(userId)
          set({ usersBilling: { ...get().usersBilling, [userId]: entitlement } })
        } catch (err) {
          set({ usersError: (err as Error).message })
          throw err
        }
      },

      revokeSupporter: async (userId) => {
        set({ usersError: null })
        try {
          const { entitlement } = await adminApi.revokeSupporter(userId)
          set({ usersBilling: { ...get().usersBilling, [userId]: entitlement } })
        } catch (err) {
          set({ usersError: (err as Error).message })
          throw err
        }
      },

      connectSocket: () => {
        const socket = getAdminSocket()

        socket.on('job_progress', (data: JobProgressEvent) => {
          get().updateJobProgress(data)
        })

        socket.on('job_completed', (data: { jobId: string; result: unknown }) => {
          get().updateJobCompleted(data.jobId, data.result)
        })

        socket.on('job_failed', (data: { jobId: string; error: string }) => {
          get().updateJobFailed(data.jobId, data.error)
        })

        socket.on('job_added', (data: { jobId: string }) => {
          get().handleJobAdded(data.jobId)
        })

        socket.on('job_active', (data: { jobId: string }) => {
          get().handleJobActive(data.jobId)
        })

        socket.on('job_delayed', (data: { jobId: string; delay: number }) => {
          get().handleJobDelayed(data.jobId, data.delay)
        })

        socket.on('job_waiting', (data: { jobId: string }) => {
          get().handleJobWaiting(data.jobId)
        })

        socket.on('job_removed', (data: { jobId: string }) => {
          get().handleJobRemoved(data.jobId)
        })

        socket.on('job_stalled', (data: { jobId: string }) => {
          get().handleJobStalled(data.jobId)
        })

        socket.on('batch_import_progress', (data: BatchImportProgressEvent) => {
          get().updateBatchImportProgress(data)
        })

        socket.on('recalculate_scores_progress', (data: RecalculateScoresProgressEvent) => {
          get().updateRecalculateScoresProgress(data)
        })

        connectAdminSocket()
      },

      disconnectSocket: () => {
        const socket = getAdminSocket()

        socket.off('job_progress')
        socket.off('job_completed')
        socket.off('job_failed')
        socket.off('job_added')
        socket.off('job_active')
        socket.off('job_delayed')
        socket.off('job_waiting')
        socket.off('job_removed')
        socket.off('job_stalled')
        socket.off('batch_import_progress')
        socket.off('recalculate_scores_progress')

        disconnectAdminSocket()
      },

      handleJobAdded: (_jobId) => {
        get().fetchJobs()
      },

      handleJobActive: (jobId) => {
        set({
          jobs: get().jobs.map((j) =>
            j.id === jobId
              ? { ...j, status: 'active' as const, startedAt: new Date().toISOString() }
              : j
          ),
        })
      },

      handleJobDelayed: (jobId, _delay) => {
        set({
          jobs: get().jobs.map((j) =>
            j.id === jobId
              ? { ...j, status: 'delayed' as const }
              : j
          ),
        })
      },

      handleJobWaiting: (jobId) => {
        set({
          jobs: get().jobs.map((j) =>
            j.id === jobId
              ? { ...j, status: 'waiting' as const }
              : j
          ),
        })
      },

      handleJobRemoved: (jobId) => {
        set({
          jobs: get().jobs.filter((j) => j.id !== jobId),
        })
      },

      handleJobStalled: (jobId) => {
        set({
          jobs: get().jobs.map((j) =>
            j.id === jobId
              ? {
                ...j,
                status: 'failed' as const,
                error: 'Job stalled and did not complete',
                failedAt: new Date().toISOString(),
              }
              : j
          ),
        })
      },
    }),
    { name: 'AdminStore' }
  )
)
