import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m, AnimatePresence } from 'framer-motion'
import { useSession } from '@/lib/auth-client'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAdminStore } from '@/stores/adminStore'
import { JobList } from '@/components/admin/JobList'
import { GameList } from '@/components/admin/GameList'
import { UserList } from '@/components/admin/UserList'
import { EmailSettings } from '@/components/admin/EmailSettings'
import { GrowthStats } from '@/components/admin/GrowthStats'
import { GeoGamersHealthCard } from '@/components/admin/GeoGamersHealthCard'
import { GeoNeedingContentCard } from '@/components/admin/GeoNeedingContentCard'
import { JobQueuePanel } from '@/components/admin/JobQueuePanel'
import { GeoReviewPanel } from '@/components/admin/GeoReviewPanel'
import { EmailLogPanel } from '@/components/admin/EmailLogPanel'
import { UserAnalyticsPanel } from '@/components/admin/UserAnalyticsPanel'
import { AnimatedTabs } from '@/components/ui/animated-tabs'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { tabContent, pageTransition, fadeInLeft } from '@/lib/animations'
import { Settings, ListTodo, Gamepad2, Users, Mail, MailCheck, TrendingUp, Compass, BarChart3 } from 'lucide-react'

// Two old tabs were folded into the unified `geo` hub:
//   - `reports`  → sub-tab `reports`
//   - `geoFetch` → sub-tab `acquisition` (the standalone "Cartes" surface
//                  duplicated triggers exposed under Géo › Catalogue)
// Bookmarks for either land on the right sub-tab via REDIRECT_TABS.
const VALID_TABS = ['jobs', 'games', 'users', 'analytics', 'email', 'emailLog', 'growth', 'geo']
const REDIRECT_TABS: Record<string, { tab: string; sub?: string }> = {
  reports: { tab: 'geo', sub: 'reports' },
  geoFetch: { tab: 'geo', sub: 'acquisition' },
}
const DEFAULT_TAB = 'jobs'

export default function AdminPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { lang } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: session, isPending } = useSession()
  const isMobile = useIsMobile()
  const [isPanelMinimized, setIsPanelMinimized] = useState(true)
  // On mobile the JobQueuePanel overlays the page instead of pushing it,
  // so only reserve right padding on viewports where the panel docks.
  const sidebarOffset = !isMobile && !isPanelMinimized ? '480px' : '0'

  const {
    fetchRecurringJobs,
    fetchCurrentImport,
  } = useAdminStore()

  const tabs = [
    { id: 'jobs', label: t('admin.tabs.jobs'), icon: <ListTodo className="size-4" /> },
    { id: 'games', label: t('admin.tabs.games'), icon: <Gamepad2 className="size-4" /> },
    { id: 'users', label: t('admin.tabs.users'), icon: <Users className="size-4" /> },
    { id: 'analytics', label: t('admin.tabs.analytics'), icon: <BarChart3 className="size-4" /> },
    { id: 'email', label: t('admin.tabs.email'), icon: <Mail className="size-4" /> },
    { id: 'emailLog', label: t('admin.tabs.emailLog'), icon: <MailCheck className="size-4" /> },
    { id: 'growth', label: t('admin.tabs.growth'), icon: <TrendingUp className="size-4" /> },
    { id: 'geo', label: t('admin.tabs.geo', 'Géo'), icon: <Compass className="size-4" /> },
  ]

  // Get active tab from URL, default to 'jobs' if not present or invalid
  const tabFromUrl = searchParams.get('tab')
  const activeTab = tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : DEFAULT_TAB

  // Handle tab change - update URL. Drop the `sub` param when switching
  // away so a stale Géo sub-tab marker doesn't ride along into other tabs.
  const handleTabChange = (tabId: string) => {
    if (VALID_TABS.includes(tabId)) {
      const newSearchParams = new URLSearchParams(searchParams)
      if (tabId === DEFAULT_TAB) {
        newSearchParams.delete('tab')
      } else {
        newSearchParams.set('tab', tabId)
      }
      if (tabId !== 'geo') newSearchParams.delete('sub')
      setSearchParams(newSearchParams, { replace: true })
    }
  }

  // Clean up invalid tab parameters from URL. Old tab ids that have been
  // folded into the Géo hub (`reports`, `geoFetch`) get rewritten so
  // bookmarks land on the right sub-tab.
  useEffect(() => {
    const currentTab = searchParams.get('tab')
    if (!currentTab) return
    if (VALID_TABS.includes(currentTab)) return
    const newSearchParams = new URLSearchParams(searchParams)
    const redirectTo = REDIRECT_TABS[currentTab]
    if (redirectTo) {
      if (redirectTo.tab === DEFAULT_TAB) {
        newSearchParams.delete('tab')
      } else {
        newSearchParams.set('tab', redirectTo.tab)
      }
      if (redirectTo.sub) newSearchParams.set('sub', redirectTo.sub)
    } else {
      newSearchParams.delete('tab')
    }
    setSearchParams(newSearchParams, { replace: true })
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
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center min-h-[60vh]"
      >
        <LoadingSpinner size="xl" />
      </m.div>
    )
  }

  if (!session || session.user?.role !== 'admin') {
    return null // Will redirect
  }

  return (
    <m.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex min-h-screen"
    >
      {/* Main Content Area */}
      <div className="flex-1 min-w-0 transition-all duration-300" style={{ paddingRight: sidebarOffset }}>
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <m.div
            variants={fadeInLeft}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-8"
          >
            <Settings className="size-6 sm:size-8 text-neon-purple" />
            <h1 className="text-2xl sm:text-3xl font-bold">{t('admin.title')}</h1>
          </m.div>

          <AnimatedTabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={handleTabChange}
            className="mb-4 sm:mb-6"
          />

          <AnimatePresence mode="wait">
            <m.div
              key={activeTab}
              variants={tabContent}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {activeTab === 'jobs' && (
                <div className="space-y-6">
                  <JobList />
                </div>
              )}
              {activeTab === 'games' && <GameList />}
              {activeTab === 'users' && <UserList />}
              {activeTab === 'analytics' && <UserAnalyticsPanel />}
              {activeTab === 'email' && <EmailSettings />}
              {activeTab === 'emailLog' && <EmailLogPanel />}
              {activeTab === 'growth' && <GrowthStats />}
              {activeTab === 'geo' && (
                <>
                  <GeoGamersHealthCard />
                  <GeoNeedingContentCard />
                  <GeoReviewPanel />
                </>
              )}
            </m.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Permanent Job Queue Panel */}
      <JobQueuePanel onMinimizedChange={setIsPanelMinimized} />
    </m.div>
  )
}
