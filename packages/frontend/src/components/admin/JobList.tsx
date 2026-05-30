import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { m, AnimatePresence } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { JobCardSkeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAdminStore } from '@/stores/adminStore'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { JobRow } from './JobRow'

// Manual jobs that are not scheduled but can be triggered. Static, so it lives
// at module scope for a single stable allocation rather than rebuilding each render.
const MANUAL_JOBS = [
  {
    id: 'manual-clear-daily-data',
    name: 'clear-daily-data',
    pattern: null,
    every: null,
    nextRun: null,
    isActive: false,
    isManual: true,
  },
]

export function JobList() {
  const { t } = useTranslation()
  const {
    isLoading,
    recurringJobs,
    triggerDailyChallengeJob,
    triggerSyncAllJob,
    cancelActiveSyncAll,
    triggerCleanupAnonymousUsersJob,
    triggerClearDailyDataJob,
    startRecalculateScores,
  } = useAdminStore()

  const [recurringJobLoading, setRecurringJobLoading] = useState<string | null>(null)
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
  const [showCancelSyncDialog, setShowCancelSyncDialog] = useState(false)

  // Combine recurring jobs with manual jobs
  const allJobs = [
    ...recurringJobs.map(job => ({ ...job, isManual: false })),
    ...MANUAL_JOBS,
  ]

  const toggleJobExpansion = (jobId: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) {
        next.delete(jobId)
      } else {
        next.add(jobId)
      }
      return next
    })
  }

  const handleTriggerRecurringJob = async (jobName: string) => {
    setRecurringJobLoading(jobName)
    try {
      if (jobName === 'create-daily-challenge') {
        await triggerDailyChallengeJob()
      } else if (jobName === 'sync-all-games') {
        await triggerSyncAllJob()
      } else if (jobName === 'cleanup-anonymous-users') {
        await triggerCleanupAnonymousUsersJob()
      } else if (jobName === 'recalculate-scores') {
        await startRecalculateScores({ batchSize: 100, dryRun: false })
      } else if (jobName === 'clear-daily-data') {
        await triggerClearDailyDataJob()
      }
    } catch (err) {
      // Handle conflict error for sync-all jobs
      if (jobName === 'sync-all-games' && err instanceof Error && err.message.includes('already in progress or paused')) {
        setShowCancelSyncDialog(true)
      }
    } finally {
      setRecurringJobLoading(null)
    }
  }

  const handleCancelAndRestartSync = async () => {
    setShowCancelSyncDialog(false)
    setRecurringJobLoading('sync-all-games')
    try {
      await cancelActiveSyncAll()
      // Now try to start again
      await triggerSyncAllJob()
    } catch (err) {
      console.error('Failed to cancel and restart sync-all:', err)
    } finally {
      setRecurringJobLoading(null)
    }
  }

  if (isLoading) {
    return (
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="h-6 w-32 skeleton rounded" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <JobCardSkeleton key={i} />
            ))}
          </CardContent>
        </Card>
      </m.div>
    )
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Jobs List */}
      {allJobs.length > 0 && (
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-card/50 backdrop-blur-sm border-neon-purple/30">
            <CardHeader className="pb-2 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <RefreshCw className="size-4 text-neon-purple shrink-0" />
                {t('admin.jobs.jobList')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <AnimatePresence initial={false}>
                <m.div
                  className="space-y-2"
                >
                  {allJobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      isExpanded={expandedJobs.has(job.id)}
                      isJobLoading={recurringJobLoading === job.name}
                      onToggle={toggleJobExpansion}
                      onTrigger={handleTriggerRecurringJob}
                    />
                  ))}
                </m.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Cancel Stuck Sync Dialog */}
      <Dialog open={showCancelSyncDialog} onOpenChange={setShowCancelSyncDialog}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning" />
              {t('admin.jobs.syncConflict.title', 'Sync Job Already Running')}
            </DialogTitle>
            <DialogDescription>
              {t('admin.jobs.syncConflict.description', 'A sync-all job is already in progress or paused. Would you like to cancel it and start a new one?')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCancelSyncDialog(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelAndRestartSync}
            >
              {t('admin.jobs.syncConflict.cancelAndRestart', 'Cancel & Restart')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </m.div>
  )
}
