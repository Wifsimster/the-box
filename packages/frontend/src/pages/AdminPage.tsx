import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/auth-client'
import { useAdminStore } from '@/stores/adminStore'
import { JobTriggerCard } from '@/components/admin/JobTriggerCard'
import { JobList } from '@/components/admin/JobList'
import { GameList } from '@/components/admin/GameList'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  joinAdminRoom,
  leaveAdminRoom,
  onJobProgress,
  onJobCompleted,
  onJobFailed,
  removeJobListeners,
} from '@/lib/socket'
import { Loader2, Settings, Download, ListTodo, Gamepad2 } from 'lucide-react'

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

      return () => {
        leaveAdminRoom()
        removeJobListeners()
        unsubProgress()
        unsubCompleted()
        unsubFailed()
      }
    }
  }, [session, fetchJobs, updateJobProgress, updateJobCompleted, updateJobFailed])

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

      <Tabs defaultValue="import" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="import" className="gap-2">
            <Download className="h-4 w-4" />
            {t('admin.tabs.import')}
          </TabsTrigger>
          <TabsTrigger value="jobs" className="gap-2">
            <ListTodo className="h-4 w-4" />
            {t('admin.tabs.jobs')}
          </TabsTrigger>
          <TabsTrigger value="games" className="gap-2">
            <Gamepad2 className="h-4 w-4" />
            {t('admin.tabs.games')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import">
          <div className="space-y-8">
            {/* Step 1: Games Import */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neon-purple/20 text-neon-purple text-sm font-bold">1</span>
                <h2 className="text-lg font-semibold">{t('admin.import.gamesSection')}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{t('admin.import.gamesSectionDesc')}</p>
              <JobTriggerCard type="import-games" />
            </section>

            {/* Step 2: Screenshots Download */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neon-pink/20 text-neon-pink text-sm font-bold">2</span>
                <h2 className="text-lg font-semibold">{t('admin.import.screenshotsSection')}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{t('admin.import.screenshotsSectionDesc')}</p>
              <JobTriggerCard type="import-screenshots" />
            </section>
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          <JobList />
        </TabsContent>

        <TabsContent value="games">
          <GameList />
        </TabsContent>
      </Tabs>
    </div>
  )
}
