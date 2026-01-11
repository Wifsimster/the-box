import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/auth-client'
import { useAdminStore } from '@/stores/adminStore'
import { JobList } from '@/components/admin/JobList'
import { GameList } from '@/components/admin/GameList'
import { ChallengeManager } from '@/components/admin/ChallengeManager'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  joinAdminRoom,
  leaveAdminRoom,
  onJobProgress,
  onJobCompleted,
  onJobFailed,
  onBatchImportProgress,
  removeJobListeners,
} from '@/lib/socket'
import { Loader2, Settings, ListTodo, Gamepad2, CalendarDays } from 'lucide-react'

export default function AdminPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { lang } = useParams()
  const { data: session, isPending } = useSession()
  const {
    fetchJobs,
    fetchRecurringJobs,
    updateJobProgress,
    updateJobCompleted,
    updateJobFailed,
    updateBatchImportProgress,
    fetchCurrentImport,
  } = useAdminStore()

  // Redirect non-admins
  useEffect(() => {
    if (!isPending && (!session || session.user.role !== 'admin')) {
      navigate(`/${lang || 'en'}`)
    }
  }, [session, isPending, navigate, lang])

  // Fetch jobs and setup socket on mount
  useEffect(() => {
    if (session?.user.role === 'admin') {
      fetchJobs()
      fetchRecurringJobs()
      fetchCurrentImport()

      // Join admin room for real-time updates
      joinAdminRoom()

      // Setup event listeners
      const unsubProgress = onJobProgress(updateJobProgress)
      const unsubCompleted = onJobCompleted((event) =>
        updateJobCompleted(event.jobId, event.result)
      )
      const unsubFailed = onJobFailed((event) =>
        updateJobFailed(event.jobId, event.error)
      )
      const unsubBatchProgress = onBatchImportProgress(updateBatchImportProgress)

      return () => {
        leaveAdminRoom()
        removeJobListeners()
        unsubProgress()
        unsubCompleted()
        unsubFailed()
        unsubBatchProgress()
      }
    }
  }, [session, fetchJobs, updateJobProgress, updateJobCompleted, updateJobFailed, updateBatchImportProgress, fetchCurrentImport])

  // Refresh jobs periodically as fallback
  useEffect(() => {
    if (session?.user.role === 'admin') {
      const interval = setInterval(() => {
        fetchJobs()
        fetchRecurringJobs()
      }, 30000) // Every 30 seconds
      return () => clearInterval(interval)
    }
  }, [session, fetchJobs, fetchRecurringJobs])

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session || session.user.role !== 'admin') {
    return null // Will redirect
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="h-8 w-8 text-neon-purple" />
        <h1 className="text-3xl font-bold">{t('admin.title')}</h1>
      </div>

      <Tabs defaultValue="jobs" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="jobs" className="gap-2">
            <ListTodo className="h-4 w-4" />
            {t('admin.tabs.jobs')}
          </TabsTrigger>
          <TabsTrigger value="games" className="gap-2">
            <Gamepad2 className="h-4 w-4" />
            {t('admin.tabs.games')}
          </TabsTrigger>
          <TabsTrigger value="challenges" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            {t('admin.tabs.challenges')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs">
          <JobList />
        </TabsContent>

        <TabsContent value="games">
          <GameList />
        </TabsContent>

        <TabsContent value="challenges">
          <ChallengeManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
