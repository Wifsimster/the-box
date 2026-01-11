import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Job, JobProgressEvent } from '@/types'
import { adminApi } from '@/lib/api'

interface AdminState {
  // Jobs data
  jobs: Job[]
  isLoading: boolean
  error: string | null

  // Stats
  stats: {
    waiting: number
    active: number
    completed: number
    failed: number
  } | null

  // Actions
  fetchJobs: () => Promise<void>
  fetchStats: () => Promise<void>
  createImportGamesJob: (targetGames?: number, screenshotsPerGame?: number) => Promise<Job>
  createImportScreenshotsJob: () => Promise<Job>
  cancelJob: (id: string) => Promise<void>
  clearCompleted: () => Promise<void>

  // Socket event handlers
  updateJobProgress: (event: JobProgressEvent) => void
  updateJobCompleted: (jobId: string, result: unknown) => void
  updateJobFailed: (jobId: string, error: string) => void
}

export const useAdminStore = create<AdminState>()(
  devtools(
    (set, get) => ({
      jobs: [],
      isLoading: false,
      error: null,
      stats: null,

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

      createImportGamesJob: async (targetGames, screenshotsPerGame) => {
        set({ error: null })
        try {
          const { job } = await adminApi.importGames(targetGames, screenshotsPerGame)
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
    }),
    { name: 'AdminStore' }
  )
)
