import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from '@/lib/auth-client'
import { useAdminStore } from '@/stores/adminStore'
import { JobList } from '@/components/admin/JobList'
import { GameList } from '@/components/admin/GameList'
import { ChallengeManager } from '@/components/admin/ChallengeManager'
import { UserList } from '@/components/admin/UserList'
import { EmailSettings } from '@/components/admin/EmailSettings'
import { JobQueuePanel } from '@/components/admin/JobQueuePanel'
import { AnimatedTabs } from '@/components/ui/animated-tabs'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { tabContent, pageTransition, fadeInLeft } from '@/lib/animations'
import { Settings, ListTodo, Gamepad2, CalendarDays, Users, Mail } from 'lucide-react'

const VALID_TABS = ['jobs', 'games', 'challenges', 'users', 'email']
const DEFAULT_TAB = 'jobs'

export default function AdminPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { lang } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: session, isPending } = useSession()

  const {
    fetchRecurringJobs,
    fetchCurrentImport,
  } = useAdminStore()

  const tabs = [
    { id: 'jobs', label: t('admin.tabs.jobs'), icon: <ListTodo className="h-4 w-4" /> },
    { id: 'games', label: t('admin.tabs.games'), icon: <Gamepad2 className="h-4 w-4" /> },
    { id: 'challenges', label: t('admin.tabs.challenges'), icon: <CalendarDays className="h-4 w-4" /> },
    { id: 'users', label: t('admin.tabs.users'), icon: <Users className="h-4 w-4" /> },
    { id: 'email', label: t('admin.tabs.email'), icon: <Mail className="h-4 w-4" /> },
  ]

  // Get active tab from URL, default to 'jobs' if not present or invalid
  const tabFromUrl = searchParams.get('tab')
  const activeTab = tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : DEFAULT_TAB

  // Handle tab change - update URL
  const handleTabChange = (tabId: string) => {
    if (VALID_TABS.includes(tabId)) {
      const newSearchParams = new URLSearchParams(searchParams)
      if (tabId === DEFAULT_TAB) {
        newSearchParams.delete('tab')
      } else {
        newSearchParams.set('tab', tabId)
      }
      setSearchParams(newSearchParams, { replace: true })
    }
  }

  // Clean up invalid tab parameters from URL
  useEffect(() => {
    const currentTab = searchParams.get('tab')
    if (currentTab && !VALID_TABS.includes(currentTab)) {
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.delete('tab')
      setSearchParams(newSearchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Redirect non-admins
  useEffect(() => {
    if (!isPending && (!session || session.user?.role !== 'admin')) {
      navigate(`/${lang || 'en'}`)
    }
  }, [session, isPending, navigate, lang])

  // Fetch initial data
  useEffect(() => {
    if (session?.user?.role === 'admin') {
      fetchRecurringJobs()
      fetchCurrentImport()
    }
  }, [session, fetchRecurringJobs, fetchCurrentImport])

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
      className="flex min-h-screen"
    >
      {/* Main Content Area */}
      <div className="flex-1 pr-120">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <motion.div
            variants={fadeInLeft}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-8"
          >
            <Settings className="h-6 w-6 sm:h-8 sm:w-8 text-neon-purple" />
            <h1 className="text-2xl sm:text-3xl font-bold">{t('admin.title')}</h1>
          </motion.div>

          <AnimatedTabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={handleTabChange}
            className="mb-4 sm:mb-6"
          />

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
              {activeTab === 'users' && <UserList />}
              {activeTab === 'email' && <EmailSettings />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Permanent Job Queue Panel */}
      <JobQueuePanel />
    </motion.div>
  )
}
