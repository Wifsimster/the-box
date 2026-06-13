import { m } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
  Trash2,
  MapPin,
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
    'schedule-daily-challenge': 'admin.jobs.scheduleDailyGeoChallenge',
    'sync-all-games': 'admin.jobs.syncAllGames',
    'cleanup-anonymous-users': 'admin.jobs.cleanupAnonymousUsers',
    'create-weekly-tournament': 'admin.jobs.createWeeklyTournament',
    'end-weekly-tournament': 'admin.jobs.endWeeklyTournament',
    'create-monthly-tournament': 'admin.jobs.createMonthlyTournament',
    'end-monthly-tournament': 'admin.jobs.endMonthlyTournament',
    'send-tournament-reminders': 'admin.jobs.sendTournamentReminders',
    'recalculate-scores': 'admin.jobs.recalculateScores',
    'clear-daily-data': 'admin.jobs.clearDailyData',
    'streak-risk-email': 'admin.jobs.streakRiskEmail',
    'relance-email': 'admin.jobs.relanceEmail',
    'inactive-user-reminder': 'admin.jobs.inactiveUserReminder',
  }
  return keyMap[jobName] || jobName
}

function getJobRunningTranslationKey(jobName: string): string {
  const keyMap: Record<string, string> = {
    'create-daily-challenge': 'admin.jobs.dailyChallengeRunning',
    'schedule-daily-challenge': 'admin.jobs.scheduleDailyGeoChallengeRunning',
    'sync-all-games': 'admin.jobs.syncAllRunning',
    'cleanup-anonymous-users': 'admin.jobs.cleanupAnonymousUsersRunning',
    'create-weekly-tournament': 'admin.jobs.createWeeklyTournamentRunning',
    'end-weekly-tournament': 'admin.jobs.endWeeklyTournamentRunning',
    'create-monthly-tournament': 'admin.jobs.createMonthlyTournamentRunning',
    'end-monthly-tournament': 'admin.jobs.endMonthlyTournamentRunning',
    'send-tournament-reminders': 'admin.jobs.sendTournamentRemindersRunning',
    'recalculate-scores': 'admin.jobs.recalculateScoresRunning',
    'clear-daily-data': 'admin.jobs.clearDailyDataRunning',
    'streak-risk-email': 'admin.jobs.streakRiskEmailRunning',
    'relance-email': 'admin.jobs.relanceEmailRunning',
    'inactive-user-reminder': 'admin.jobs.inactiveUserReminderRunning',
  }
  return keyMap[jobName] || jobName
}

function getJobMetadata(jobName: string, t: (key: string) => string) {
  const metadata: Record<string, {
    description: string
    icon: React.ReactNode
    category: string
  }> = {
    'create-daily-challenge': {
      description: t('admin.jobs.descriptions.createDailyChallenge'),
      icon: <Calendar className="size-4" />,
      category: 'Challenge',
    },
    'schedule-daily-challenge': {
      description: t('admin.jobs.descriptions.scheduleDailyGeoChallenge'),
      icon: <MapPin className="size-4" />,
      category: 'Challenge',
    },
    'sync-all-games': {
      description: t('admin.jobs.descriptions.syncAllGames'),
      icon: <Database className="size-4" />,
      category: 'Maintenance',
    },
    'cleanup-anonymous-users': {
      description: t('admin.jobs.descriptions.cleanupAnonymousUsers'),
      icon: <Users className="size-4" />,
      category: 'Maintenance',
    },
    'create-weekly-tournament': {
      description: t('admin.jobs.descriptions.createWeeklyTournament'),
      icon: <Trophy className="size-4" />,
      category: 'Tournament',
    },
    'end-weekly-tournament': {
      description: t('admin.jobs.descriptions.endWeeklyTournament'),
      icon: <Trophy className="size-4" />,
      category: 'Tournament',
    },
    'create-monthly-tournament': {
      description: t('admin.jobs.descriptions.createMonthlyTournament'),
      icon: <Trophy className="size-4" />,
      category: 'Tournament',
    },
    'end-monthly-tournament': {
      description: t('admin.jobs.descriptions.endMonthlyTournament'),
      icon: <Trophy className="size-4" />,
      category: 'Tournament',
    },
    'send-tournament-reminders': {
      description: t('admin.jobs.descriptions.sendTournamentReminders'),
      icon: <Mail className="size-4" />,
      category: 'Notification',
    }, 'recalculate-scores': {
      description: t('admin.jobs.descriptions.recalculateScores'),
      icon: <RefreshCw className="size-4" />,
      category: 'Maintenance',
    },
    'clear-daily-data': {
      description: t('admin.jobs.descriptions.clearDailyData'),
      icon: <Trash2 className="size-4" />,
      category: 'Maintenance',
    },
    'streak-risk-email': {
      description: t('admin.jobs.descriptions.streakRiskEmail'),
      icon: <Mail className="size-4" />,
      category: 'Notification',
    },
    'relance-email': {
      description: t('admin.jobs.descriptions.relanceEmail'),
      icon: <Mail className="size-4" />,
      category: 'Notification',
    },
    'inactive-user-reminder': {
      description: t('admin.jobs.descriptions.inactiveUserReminder'),
      icon: <Mail className="size-4" />,
      category: 'Notification',
    },
  }

  return metadata[jobName] || {
    description: t('admin.jobs.descriptions.default'),
    icon: <RefreshCw className="size-4" />,
    category: 'Other',
  }
}

export interface JobRowData {
  id: string
  name: string
  pattern: string | null
  every: number | null
  nextRun: string | null
  isActive: boolean
  isManual: boolean
}

interface JobRowProps {
  job: JobRowData
  isExpanded: boolean
  isJobLoading: boolean
  onToggle: (jobId: string) => void
  onTrigger: (jobName: string) => void
}

export function JobRow({ job, isExpanded, isJobLoading, onToggle, onTrigger }: JobRowProps) {
  const { t } = useTranslation()
  const metadata = getJobMetadata(job.name, t)

  return (
    <Collapsible open={isExpanded} onOpenChange={() => onToggle(job.id)}>
      <m.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3, layout: { duration: 0.2 } }}
        className="rounded-lg bg-muted/50 border border-transparent hover:border-primary/20 transition-all duration-200"
      >
        {/* Job Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 p-0 shrink-0"
              >
                <ChevronDown
                  className={`size-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''
                    }`}
                />
                <span className="sr-only">{t('common.toggleDetails')}</span>
              </Button>
            </CollapsibleTrigger>

            {job.isActive || isJobLoading ? (
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="size-4 animate-spin text-neon-blue shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-neon-blue/80 truncate">
                  {t(getJobRunningTranslationKey(job.name))}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                {metadata.icon && (
                  <div className="shrink-0 text-success">
                    {metadata.icon}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs sm:text-sm font-medium truncate">
                    {t(getJobTranslationKey(job.name))}
                  </span>
                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                    {t(`admin.jobs.categories.${metadata.category}`)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 sm:shrink-0">
            {!isExpanded && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-muted-foreground">
                {job.isManual ? (
                  <span className="text-score-low/80 whitespace-nowrap">
                    {t('admin.jobs.manual', 'Manual')}
                  </span>
                ) : job.nextRun && !job.isActive ? (
                  <span className="text-neon-purple whitespace-nowrap">
                    {formatRelativeTime(job.nextRun)}
                  </span>
                ) : null}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTrigger(job.name)}
              disabled={job.isActive || isJobLoading}
              className="border-neon-purple/30 hover:bg-neon-purple/10 w-full sm:w-auto sm:shrink-0"
            >
              {isJobLoading ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <Play className="size-4 mr-1" />
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
              <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {metadata.description}
              </p>
            </div>

            {/* Periodicity & Schedule */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Interval */}
              {job.every && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background/50">
                  <Timer className="size-3.5 text-neon-purple shrink-0" />
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
                  <Clock className="size-3.5 text-neon-purple shrink-0" />
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
              {job.nextRun && !job.isActive && !job.isManual && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background/50">
                  <Calendar className="size-3.5 text-neon-purple shrink-0" />
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

              {/* Manual Job Indicator */}
              {job.isManual && !job.isActive && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-score-low/10">
                  <Play className="size-3.5 text-score-low/80 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {t('admin.jobs.schedule')}
                    </span>
                    <span className="text-xs font-medium text-score-low/80">
                      {t('admin.jobs.manual')}
                    </span>
                  </div>
                </div>
              )}

              {/* Status */}
              {job.isActive && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-neon-blue/10">
                  <Loader2 className="size-3.5 text-neon-blue shrink-0 animate-spin" />
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {t('admin.jobs.statusLabel')}
                    </span>
                    <span className="text-xs font-medium text-neon-blue/80">
                      {t('admin.jobs.running')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </m.div>
    </Collapsible>
  )
}
