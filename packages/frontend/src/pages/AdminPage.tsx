import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/auth-client'
import { useAdminStore } from '@/stores/adminStore'
import { JobTriggerCard } from '@/components/admin/JobTriggerCard'
import { JobList } from '@/components/admin/JobList'
import {
  joinAdminRoom,
  leaveAdminRoom,
  onJobProgress,
  onJobCompleted,
  onJobFailed,
  removeJobListeners,
} from '@/lib/socket'
import { Loader2, Settings } from 'lucide-react'

export default function AdminPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { lang } = useParams()
  const { data: session, isPending } = useSession()
  const {
    fetchJobs,
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
      const interval = setInterval(fetchJobs, 30000) // Every 30 seconds
      return () => clearInterval(interval)
    }
  }, [session, fetchJobs])

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

      <div className="grid gap-6 md:grid-cols-2 mb-8">
        <JobTriggerCard type="import-games" />
        <JobTriggerCard type="import-screenshots" />
      </div>

      <JobList />
    </div>
  )
}
