import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from '@/lib/auth-client'
import { useAdminStore } from '@/stores/adminStore'
import { JobList } from '@/components/admin/JobList'
import { GameList } from '@/components/admin/GameList'
import { ChallengeManager } from '@/components/admin/ChallengeManager'
import { AnimatedTabs } from '@/components/ui/animated-tabs'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { tabContent, pageTransition } from '@/lib/animations'
import {
  joinAdminRoom,
  leaveAdminRoom,
  onJobProgress,
  onJobCompleted,
  onJobFailed,
  onBatchImportProgress,
  removeJobListeners,
} from '@/lib/socket'
import { Settings, ListTodo, Gamepad2, CalendarDays } from 'lucide-react'

export default function AdminPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { lang } = useParams()
  const { data: session, isPending } = useSession()
  const [activeTab, setActiveTab] = useState('jobs')
  const {
    fetchJobs,
    fetchRecurringJobs,
    updateJobProgress,
    updateJobCompleted,
    updateJobFailed,
    updateBatchImportProgress,
    fetchCurrentImport,
  } = useAdminStore()

  const tabs = [
    { id: 'jobs', label: t('admin.tabs.jobs'), icon: <ListTodo className="h-4 w-4" /> },
    { id: 'games', label: t('admin.tabs.games'), icon: <Gamepad2 className="h-4 w-4" /> },
    { id: 'challenges', label: t('admin.tabs.challenges'), icon: <CalendarDays className="h-4 w-4" /> },
  ]

  // Redirect non-admins
  useEffect(() => {
    if (!isPending && (!session || session.user?.role !== 'admin')) {
      navigate(`/${lang || 'en'}`)
    }
  }, [session, isPending, navigate, lang])

  // Fetch jobs and setup socket on mount
  useEffect(() => {
    if (session?.user?.role === 'admin') {
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
    if (session?.user?.role === 'admin') {
      const interval = setInterval(() => {
        fetchJobs()
        fetchRecurringJobs()
      }, 30000) // Every 30 seconds
      return () => clearInterval(interval)
    }
  }, [session, fetchJobs, fetchRecurringJobs])

  if (isPending) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center min-h-[60vh]"
      >
        <LoadingSpinner size="xl" />
      </motion.div>
    )
  }

  if (!session || session.user?.role !== 'admin') {
    return null // Will redirect
  }

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
      className="container mx-auto px-4 py-8"
    >
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-3 mb-8"
      >
        <motion.div
          animate={{
            rotate: [0, 10, -10, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <Settings className="h-8 w-8 text-neon-purple" />
        </motion.div>
        <h1 className="text-3xl font-bold">{t('admin.title')}</h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <AnimatedTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="mb-6"
        />
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          variants={tabContent}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {activeTab === 'jobs' && <JobList />}
          {activeTab === 'games' && <GameList />}
          {activeTab === 'challenges' && <ChallengeManager />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
