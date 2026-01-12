import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AnimatedProgress } from '@/components/ui/animated-progress'
import { JobCardSkeleton } from '@/components/ui/skeleton'
import { useAdminStore } from '@/stores/adminStore'
import { FullImportCard } from './FullImportCard'
import { staggerContainer, listItem, hoverGlow } from '@/lib/animations'
import {
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  Pause,
  Trash2,
  Loader2,
  RefreshCw,
  Timer,
  Calendar,
} from 'lucide-react'
import type { JobStatus } from '@/types'

const statusIcons: Record<JobStatus, React.ReactNode> = {
  waiting: <Clock className="h-4 w-4 text-yellow-500" />,
  active: <Play className="h-4 w-4 text-blue-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  delayed: <Pause className="h-4 w-4 text-orange-500" />,
}

const statusBadgeVariants: Record<JobStatus, 'success' | 'destructive' | 'info' | 'warning'> = {
  waiting: 'warning',
  active: 'info',
  completed: 'success',
  failed: 'destructive',
  delayed: 'warning',
}

const progressVariants: Record<JobStatus, 'default' | 'success' | 'warning' | 'error'> = {
  waiting: 'warning',
  active: 'default',
  completed: 'success',
  failed: 'error',
  delayed: 'warning',
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString()
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / 60000)

  if (diffMinutes < 0) {
    return 'now'
  } else if (diffMinutes < 60) {
    return `in ${diffMinutes}m`
  } else {
    const hours = Math.floor(diffMinutes / 60)
    const mins = diffMinutes % 60
    return `in ${hours}h ${mins}m`
  }
}

function formatInterval(ms: number): string {
  const hours = ms / 3600000
  if (hours >= 1) {
    return `${hours}h`
  }
  const minutes = ms / 60000
  return `${minutes}m`
}

function formatCronPattern(pattern: string, t: (key: string) => string): string {
  // Common cron patterns
  if (pattern === '0 0 * * *') {
    return t('admin.jobs.atMidnight')
  }
  if (pattern === '0 2 * * 0') {
    return t('admin.jobs.weeklySunday2am')
  }
  return pattern
}

function getJobTranslationKey(jobName: string): string {
  const keyMap: Record<string, string> = {
    'create-daily-challenge': 'admin.jobs.createDailyChallenge',
    'sync-all-games': 'admin.jobs.syncAllGames',
  }
  return keyMap[jobName] || jobName
}

function getJobRunningTranslationKey(jobName: string): string {
  const keyMap: Record<string, string> = {
    'create-daily-challenge': 'admin.jobs.dailyChallengeRunning',
    'sync-all-games': 'admin.jobs.syncAllRunning',
  }
  return keyMap[jobName] || jobName
}

export function JobList() {
  const { t } = useTranslation()
  const {
    jobs,
    isLoading,
    cancelJob,
    clearCompleted,
    recurringJobs,
    triggerDailyChallengeJob,
    triggerSyncAllJob,
  } = useAdminStore()

  const [recurringJobLoading, setRecurringJobLoading] = useState<string | null>(null)

  const handleTriggerRecurringJob = async (jobName: string) => {
    setRecurringJobLoading(jobName)
    try {
      if (jobName === 'create-daily-challenge') {
        await triggerDailyChallengeJob()
      } else if (jobName === 'sync-all-games') {
        await triggerSyncAllJob()
      }
    } finally {
      setRecurringJobLoading(null)
    }
  }

  if (isLoading) {
    return (
      <motion.div
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
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Full Import */}
      <FullImportCard />

      {/* Recurring Jobs Status */}
      {recurringJobs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-card/50 backdrop-blur-sm border-neon-purple/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCw className="h-4 w-4 text-neon-purple" />
                {t('admin.jobs.recurringJobs')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="space-y-3"
              >
                {recurringJobs.map((job) => {
                  const isJobLoading = recurringJobLoading === job.name
                  const JobIcon = job.name === 'create-daily-challenge' ? Calendar : Timer

                  return (
                    <motion.div
                      key={job.id}
                      variants={listItem}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-transparent hover:border-purple-500/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {job.isActive || isJobLoading ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                            <span className="text-sm font-medium text-blue-400">
                              {t(getJobRunningTranslationKey(job.name))}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <JobIcon className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">
                              {t(getJobTranslationKey(job.name))}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {job.every && (
                            <span>{t('admin.jobs.every')} {formatInterval(job.every)}</span>
                          )}
                          {job.pattern && (
                            <span>{formatCronPattern(job.pattern, t)}</span>
                          )}
                          {job.nextRun && !job.isActive && (
                            <span className="text-neon-purple">
                              {t('admin.jobs.nextRun')}: {formatRelativeTime(job.nextRun)}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTriggerRecurringJob(job.name)}
                          disabled={job.isActive || isJobLoading}
                          className="border-neon-purple/30 hover:bg-neon-purple/10"
                        >
                          {isJobLoading ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-1" />
                          )}
                          {t('admin.jobs.runNow')}
                        </Button>
                      </div>
                    </motion.div>
                  )
                })}
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Job History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('admin.jobs.title')}</CardTitle>
            {jobs.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCompleted}>
                <Trash2 className="h-4 w-4 mr-1" />
                {t('admin.jobs.clearAll')}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-muted-foreground py-8"
              >
                {t('admin.jobs.noJobs')}
              </motion.p>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="space-y-4"
              >
                <AnimatePresence mode="popLayout">
                  {jobs.map((job) => (
                    <motion.div
                      key={job.id}
                      variants={listItem}
                      layout
                      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                      whileHover={{
                        scale: 1.01,
                        boxShadow: '0 0 25px oklch(0.7 0.25 300 / 0.15)',
                      }}
                      className="flex flex-col gap-3 p-4 rounded-lg bg-muted/50 border border-transparent hover:border-purple-500/20 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <motion.div
                            animate={job.status === 'active' ? {
                              scale: [1, 1.2, 1],
                              opacity: [1, 0.7, 1],
                            } : {}}
                            transition={{ duration: 1, repeat: Infinity }}
                          >
                            {statusIcons[job.status]}
                          </motion.div>
                          <div>
                            <p className="font-medium">
                              {job.type === 'import-games'
                                ? t('admin.jobs.importGames')
                                : job.type === 'create-daily-challenge'
                                  ? t('admin.jobs.createDailyChallenge')
                                  : job.type === 'batch-import-games'
                                    ? t('admin.fullImport.title')
                                    : t('admin.jobs.importScreenshots')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(job.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <motion.div
                            animate={job.status === 'active' ? {
                              scale: [1, 1.05, 1],
                            } : {}}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            <Badge variant={statusBadgeVariants[job.status]}>
                              {t(`admin.jobs.status.${job.status}`)}
                            </Badge>
                          </motion.div>
                          {(job.status === 'waiting' || job.status === 'active') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => cancelJob(job.id)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {job.status === 'active' && (
                        <AnimatedProgress
                          value={job.progress}
                          variant={progressVariants[job.status]}
                          showValue
                        />
                      )}

                      {job.status === 'completed' && job.result && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm text-muted-foreground"
                        >
                          {job.result.message}
                        </motion.p>
                      )}

                      {job.status === 'failed' && job.error && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm text-red-400"
                        >
                          {job.error}
                        </motion.p>
                      )}

                      {job.data && (job.data.targetGames || job.data.screenshotsPerGame || job.data.maxGames) && (
                        <div className="text-xs text-muted-foreground">
                          {job.data.targetGames && (
                            <span className="mr-3">
                              {t('admin.jobs.targetGames')}: {job.data.targetGames}
                            </span>
                          )}
                          {job.data.maxGames && (
                            <span className="mr-3">
                              {t('admin.jobs.maxGames')}: {job.data.maxGames}
                            </span>
                          )}
                          {job.data.screenshotsPerGame && (
                            <span>
                              {t('admin.jobs.screenshotsPerGame')}: {job.data.screenshotsPerGame}
                            </span>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
