import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { JobCardSkeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAdminStore } from '@/stores/adminStore'
import { FullImportCard } from './FullImportCard'
import { staggerContainer, listItem } from '@/lib/animations'
import {
  Clock,
  Play,
  Loader2,
  RefreshCw,
  Timer,
  Calendar,
  ChevronDown,
  Info,
  Trophy,
  Mail,
  Database,
  Users,
} from 'lucide-react'

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
    'cleanup-anonymous-users': 'admin.jobs.cleanupAnonymousUsers',
    'create-weekly-tournament': 'admin.jobs.createWeeklyTournament',
    'end-weekly-tournament': 'admin.jobs.endWeeklyTournament',
    'create-monthly-tournament': 'admin.jobs.createMonthlyTournament',
    'end-monthly-tournament': 'admin.jobs.endMonthlyTournament',
    'send-tournament-reminders': 'admin.jobs.sendTournamentReminders',
  }
  return keyMap[jobName] || jobName
}

function getJobRunningTranslationKey(jobName: string): string {
  const keyMap: Record<string, string> = {
    'create-daily-challenge': 'admin.jobs.dailyChallengeRunning',
    'sync-all-games': 'admin.jobs.syncAllRunning',
    'cleanup-anonymous-users': 'admin.jobs.cleanupAnonymousUsersRunning',
    'create-weekly-tournament': 'admin.jobs.createWeeklyTournamentRunning',
    'end-weekly-tournament': 'admin.jobs.endWeeklyTournamentRunning',
    'create-monthly-tournament': 'admin.jobs.createMonthlyTournamentRunning',
    'end-monthly-tournament': 'admin.jobs.endMonthlyTournamentRunning',
    'send-tournament-reminders': 'admin.jobs.sendTournamentRemindersRunning',
  }
  return keyMap[jobName] || jobName
}

function getPriorityLabel(priority: number | undefined): { label: string; color: string } {
  if (priority === undefined || priority === 0) {
    return { label: 'Normal', color: 'text-blue-400' }
  } else if (priority >= 1000) {
    return { label: 'Low', color: 'text-gray-400' }
  } else if (priority >= 100) {
    return { label: 'Medium', color: 'text-yellow-400' }
  } else {
    return { label: 'High', color: 'text-red-400' }
  }
}

function getJobMetadata(jobName: string, t: (key: string) => string) {
  const metadata: Record<string, {
    description: string
    icon: React.ReactNode
    category: string
  }> = {
    'create-daily-challenge': {
      description: t('admin.jobs.descriptions.createDailyChallenge'),
      icon: <Calendar className="h-4 w-4" />,
      category: 'Challenge',
    },
    'sync-all-games': {
      description: t('admin.jobs.descriptions.syncAllGames'),
      icon: <Database className="h-4 w-4" />,
      category: 'Maintenance',
    },
    'cleanup-anonymous-users': {
      description: t('admin.jobs.descriptions.cleanupAnonymousUsers'),
      icon: <Users className="h-4 w-4" />,
      category: 'Maintenance',
    },
    'create-weekly-tournament': {
      description: t('admin.jobs.descriptions.createWeeklyTournament'),
      icon: <Trophy className="h-4 w-4" />,
      category: 'Tournament',
    },
    'end-weekly-tournament': {
      description: t('admin.jobs.descriptions.endWeeklyTournament'),
      icon: <Trophy className="h-4 w-4" />,
      category: 'Tournament',
    },
    'create-monthly-tournament': {
      description: t('admin.jobs.descriptions.createMonthlyTournament'),
      icon: <Trophy className="h-4 w-4" />,
      category: 'Tournament',
    },
    'end-monthly-tournament': {
      description: t('admin.jobs.descriptions.endMonthlyTournament'),
      icon: <Trophy className="h-4 w-4" />,
      category: 'Tournament',
    },
    'send-tournament-reminders': {
      description: t('admin.jobs.descriptions.sendTournamentReminders'),
      icon: <Mail className="h-4 w-4" />,
      category: 'Notification',
    },
  }

  return metadata[jobName] || {
    description: t('admin.jobs.descriptions.default'),
    icon: <RefreshCw className="h-4 w-4" />,
    category: 'Other',
  }
}

export function JobList() {
  const { t } = useTranslation()
  const {
    isLoading,
    recurringJobs,
    triggerDailyChallengeJob,
    triggerSyncAllJob,
  } = useAdminStore()

  const [recurringJobLoading, setRecurringJobLoading] = useState<string | null>(null)
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Challenge' | 'Maintenance' | 'Tournament' | 'Notification'>('all')

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
      }
    } finally {
      setRecurringJobLoading(null)
    }
  }

  // Filter recurring jobs by category
  const getFilteredRecurringJobs = () => {
    if (categoryFilter === 'all') {
      return recurringJobs
    }
    return recurringJobs.filter(job => {
      const metadata = getJobMetadata(job.name, t)
      return metadata.category === categoryFilter
    })
  }

  const filteredRecurringJobs = getFilteredRecurringJobs()

  // Get counts for each category
  const categoryCounts = {
    all: recurringJobs.length,
    Challenge: recurringJobs.filter(j => getJobMetadata(j.name, t).category === 'Challenge').length,
    Maintenance: recurringJobs.filter(j => getJobMetadata(j.name, t).category === 'Maintenance').length,
    Tournament: recurringJobs.filter(j => getJobMetadata(j.name, t).category === 'Tournament').length,
    Notification: recurringJobs.filter(j => getJobMetadata(j.name, t).category === 'Notification').length,
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
            <CardHeader className="pb-2 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <RefreshCw className="h-4 w-4 text-neon-purple shrink-0" />
                {t('admin.jobs.recurringJobs')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              {/* Category Filter Tabs */}
              <Tabs value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as any)} className="mb-4">
                <TabsList className="w-full h-9 p-1">
                  <TabsTrigger value="all" className="flex-1 text-xs">
                    {t('admin.jobs.category.all', 'All')}
                    <Badge variant="secondary" className="ml-1.5 h-5 min-w-4 px-1.5 text-[10px]">
                      {categoryCounts.all}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="Challenge" className="flex-1 text-xs">
                    {t('admin.jobs.category.challenge', 'Challenge')}
                    <Badge variant="secondary" className="ml-1.5 h-5 min-w-4 px-1.5 text-[10px]">
                      {categoryCounts.Challenge}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="Maintenance" className="flex-1 text-xs">
                    {t('admin.jobs.category.maintenance', 'Maintenance')}
                    <Badge variant="secondary" className="ml-1.5 h-5 min-w-4 px-1.5 text-[10px]">
                      {categoryCounts.Maintenance}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="Tournament" className="flex-1 text-xs">
                    {t('admin.jobs.category.tournament', 'Tournament')}
                    <Badge variant="secondary" className="ml-1.5 h-5 min-w-4 px-1.5 text-[10px]">
                      {categoryCounts.Tournament}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="Notification" className="flex-1 text-xs">
                    {t('admin.jobs.category.notification', 'Notification')}
                    <Badge variant="secondary" className="ml-1.5 h-5 min-w-4 px-1.5 text-[10px]">
                      {categoryCounts.Notification}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <AnimatePresence initial={false}>
              <motion.div
                className="space-y-2"
              >
                {filteredRecurringJobs.map((job) => {
                  const isJobLoading = recurringJobLoading === job.name
                  const isExpanded = expandedJobs.has(job.id)
                  const metadata = getJobMetadata(job.name, t)

                  return (
                    <Collapsible
                      key={job.id}
                      open={isExpanded}
                      onOpenChange={() => toggleJobExpansion(job.id)}
                    >
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, layout: { duration: 0.2 } }}
                        className="rounded-lg bg-muted/50 border border-transparent hover:border-purple-500/20 transition-all duration-200"
                      >
                        {/* Job Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 shrink-0"
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''
                                    }`}
                                />
                                <span className="sr-only">Toggle details</span>
                              </Button>
                            </CollapsibleTrigger>

                            {job.isActive || isJobLoading ? (
                              <div className="flex items-center gap-2 min-w-0">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                                <span className="text-xs sm:text-sm font-medium text-blue-400 truncate">
                                  {t(getJobRunningTranslationKey(job.name))}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 min-w-0">
                                {metadata.icon && (
                                  <div className="shrink-0 text-green-500">
                                    {metadata.icon}
                                  </div>
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs sm:text-sm font-medium truncate">
                                    {t(getJobTranslationKey(job.name))}
                                  </span>
                                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                                    {metadata.category}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 sm:shrink-0">
                            {!isExpanded && (
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-muted-foreground">
                                {job.nextRun && !job.isActive && (
                                  <span className="text-neon-purple whitespace-nowrap">
                                    {formatRelativeTime(job.nextRun)}
                                  </span>
                                )}
                              </div>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTriggerRecurringJob(job.name)}
                              disabled={job.isActive || isJobLoading}
                              className="border-neon-purple/30 hover:bg-neon-purple/10 w-full sm:w-auto sm:shrink-0"
                            >
                              {isJobLoading ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4 mr-1" />
                              )}
                              {t('admin.jobs.runNow')}
                            </Button>
                          </div>
                        </div>

                        {/* Collapsible Content */}
                        <CollapsibleContent className="px-3 sm:px-4 pb-3 sm:pb-4">
                          <div className="mt-2 pt-3 border-t border-border/50 space-y-3">
                            {/* Description */}
                            <div className="flex gap-2">
                              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                {metadata.description}
                              </p>
                            </div>

                            {/* Periodicity & Schedule */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* Interval */}
                              {job.every && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background/50">
                                  <Timer className="h-3.5 w-3.5 text-neon-purple shrink-0" />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                      {t('admin.jobs.interval')}
                                    </span>
                                    <span className="text-xs font-medium">
                                      {t('admin.jobs.every')} {formatInterval(job.every)}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Cron Pattern */}
                              {job.pattern && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background/50">
                                  <Clock className="h-3.5 w-3.5 text-neon-purple shrink-0" />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                      {t('admin.jobs.schedule')}
                                    </span>
                                    <span className="text-xs font-medium">
                                      {formatCronPattern(job.pattern, t)}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Next Run */}
                              {job.nextRun && !job.isActive && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background/50">
                                  <Calendar className="h-3.5 w-3.5 text-neon-purple shrink-0" />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                      {t('admin.jobs.nextRun')}
                                    </span>
                                    <span className="text-xs font-medium text-neon-purple">
                                      {formatRelativeTime(job.nextRun)}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Status */}
                              {job.isActive && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10">
                                  <Loader2 className="h-3.5 w-3.5 text-blue-500 shrink-0 animate-spin" />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                      {t('admin.jobs.status')}
                                    </span>
                                    <span className="text-xs font-medium text-blue-400">
                                      {t('admin.jobs.running')}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </motion.div>
                    </Collapsible>
                  )
                })}
              </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}
