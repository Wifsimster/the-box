import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { m, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AnimatedProgress } from '@/components/ui/animated-progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAdminStore } from '@/stores/adminStore'
import { Trash2, Loader2, Clock, Play, CheckCircle2, XCircle, Pause, RefreshCw, ChevronRight, ChevronLeft, X } from 'lucide-react'
import type { JobStatus } from '@/types'

const statusIcons: Record<JobStatus, React.ReactNode> = {
    waiting: <Clock className="size-3 text-warning" />,
    active: <Play className="size-3 text-neon-blue" />,
    completed: <CheckCircle2 className="size-3 text-success" />,
    failed: <XCircle className="size-3 text-error" />,
    delayed: <Pause className="size-3 text-score-low" />,
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

function formatDate(
    dateString: string,
    t: ReturnType<typeof useTranslation>['t'],
    language: string,
): string {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (seconds < 60) return t('admin.jobs.relativeTime.secondsAgo', { count: seconds })
    if (minutes < 60) return t('admin.jobs.relativeTime.minutesAgo', { count: minutes })
    if (hours < 24) return t('admin.jobs.relativeTime.hoursAgo', { count: hours })
    return date.toLocaleDateString(language)
}

function formatNextRunDate(dateString: string, language: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString(language, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    })
}

function getJobTranslationKey(jobName: string): string {
    const keyMap: Record<string, string> = {
        'import-games': 'admin.jobs.importGames',
        'import-screenshots': 'admin.jobs.importScreenshots',
        'sync-new-games': 'admin.jobs.syncNewGames',
        'batch-import-games': 'admin.jobs.batchImportGames',
        'create-daily-challenge': 'admin.jobs.createDailyChallenge',
        'sync-all-games': 'admin.jobs.syncAllGames',
        'cleanup-anonymous-users': 'admin.jobs.cleanupAnonymousUsers',
        'create-weekly-tournament': 'admin.jobs.createWeeklyTournament',
        'end-weekly-tournament': 'admin.jobs.endWeeklyTournament',
        'create-monthly-tournament': 'admin.jobs.createMonthlyTournament',
        'end-monthly-tournament': 'admin.jobs.endMonthlyTournament',
        'send-tournament-reminders': 'admin.jobs.sendTournamentReminders',
        'recalculate-scores': 'admin.jobs.recalculateScores',
    }
    return keyMap[jobName] || jobName
}

interface JobQueuePanelProps {
    onMinimizedChange?: (isMinimized: boolean) => void
}

export function JobQueuePanel({ onMinimizedChange }: JobQueuePanelProps = {}) {
    const { t, i18n } = useTranslation()
    const { jobs, isLoading, fetchJobs, clearCompleted, cancelJob, connectSocket, disconnectSocket } = useAdminStore()
    const [filterTab, setFilterTab] = useState<'all' | 'active' | 'completed' | 'failed' | 'delayed'>('all')
    const [isMinimized, setIsMinimized] = useState(true)
    const [confirmClearOpen, setConfirmClearOpen] = useState(false)
    const isMobile = useIsMobile()
    // Full viewport on phones, fixed dock on tablets+. Keep as a string so the
    // value flows straight into Framer Motion's animate config.
    const expandedWidth = isMobile ? '100vw' : '480px'

    const handleToggleMinimize = () => {
        const newState = !isMinimized
        setIsMinimized(newState)
        onMinimizedChange?.(newState)
    }

    // Keep the latest callback in a ref so the mount-only notification effect
    // can run with an empty dependency array without re-firing whenever the
    // parent passes a fresh callback identity.
    const onMinimizedChangeRef = useRef(onMinimizedChange)
    useEffect(() => {
        onMinimizedChangeRef.current = onMinimizedChange
    }, [onMinimizedChange])

    useEffect(() => {
        // Notify parent of initial state
        onMinimizedChangeRef.current?.(true)
    }, [])

    useEffect(() => {
        fetchJobs()
        connectSocket()

        return () => {
            disconnectSocket()
        }
    }, [fetchJobs, connectSocket, disconnectSocket])

    const handleClearAll = async () => {
        try {
            await clearCompleted()
        } catch (err) {
            console.error('Failed to clear jobs:', err)
        } finally {
            setConfirmClearOpen(false)
        }
    }

    useEffect(() => {
        if (isMinimized) return
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !confirmClearOpen) {
                setIsMinimized(true)
                onMinimizedChangeRef.current?.(true)
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [isMinimized, confirmClearOpen])

    const handleCancelJob = async (jobId: string) => {
        try {
            await cancelJob(jobId)
        } catch (err) {
            console.error('Failed to cancel job:', err)
        }
    }

    // Filter jobs based on selected tab
    const getFilteredJobs = () => {
        switch (filterTab) {
            case 'active':
                return jobs.filter((j) => j.status === 'active' || j.status === 'waiting' || j.status === 'delayed')
            case 'completed':
                return jobs.filter((j) => j.status === 'completed')
            case 'failed':
                return jobs.filter((j) => j.status === 'failed')
            default:
                return jobs
        }
    }

    const filteredJobs = getFilteredJobs()
    const activeJobs = jobs.filter((j) => j.status === 'active' || j.status === 'waiting' || j.status === 'delayed')
    const completedJobs = jobs.filter((j) => j.status === 'completed')
    const failedJobs = jobs.filter((j) => j.status === 'failed')
    const activeCount = jobs.filter((j) => j.status === 'active' || j.status === 'waiting').length

    return (
        <>
            {/* Mobile backdrop — overlays page content when the panel is open on phones. */}
            <AnimatePresence>
                {!isMinimized && isMobile && (
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={handleToggleMinimize}
                        className="fixed inset-0 top-[var(--header-h)] bg-background/60 backdrop-blur-sm z-40"
                        aria-hidden="true"
                    />
                )}
            </AnimatePresence>
            <m.div
                role="complementary"
                aria-label={t('admin.jobs.queueTitle', 'Job Queue')}
                className="fixed right-0 top-[var(--header-h)] h-[calc(100dvh-var(--header-h))] max-w-[100vw] border-l bg-card shadow-lg flex flex-col z-50 pointer-events-auto"
                initial={false}
                animate={{
                    width: isMinimized ? '0px' : expandedWidth
                }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
            {/* Minimize/Expand Button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleMinimize}
                aria-expanded={!isMinimized}
                aria-label={isMinimized ? t('admin.jobs.expand', 'Expand') : t('admin.jobs.minimize', 'Minimize')}
                title={isMinimized ? t('admin.jobs.expand', 'Expand') : t('admin.jobs.minimize', 'Minimize')}
                className={`absolute -left-11 bottom-[calc(var(--bottom-nav-space)+1rem)] size-11 md:bottom-auto md:top-4 md:-left-8 md:size-8 rounded-l-md rounded-r-none border border-r-0 bg-card hover:bg-muted z-10 shadow-md ${!isMinimized && isMobile ? 'hidden' : ''}`}
            >
                {isMinimized ? (
                    <ChevronLeft className="size-4" />
                ) : (
                    <ChevronRight className="size-4" />
                )}
                {activeCount > 0 && isMinimized && (
                    <span className="absolute -top-1.5 -left-1.5 flex min-w-5 h-5 items-center justify-center rounded-full bg-neon-blue px-1 text-[11px] font-semibold text-background tabular-nums" aria-hidden="true">
                        {activeCount}
                    </span>
                )}
            </Button>

            {/* Panel Content */}
            {!isMinimized && (
                <>
                    {/* Header */}
                    <div className="p-3 sm:p-4 border-b bg-muted/50 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="font-semibold text-base">{t('admin.jobs.queueTitle', 'Job Queue')}</h2>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="dangerGhost"
                                    size="sm"
                                    onClick={() => setConfirmClearOpen(true)}
                                    disabled={jobs.length === 0}
                                    className="h-(--control-h)"
                                >
                                    <Trash2 className="size-4" />
                                    {t('admin.jobs.clearAll', 'Clear')}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleToggleMinimize}
                                    aria-label={t('common.close')}
                                    className="md:hidden"
                                >
                                    <X className="size-5" />
                                </Button>
                            </div>
                        </div>

                        <Tabs value={filterTab} onValueChange={(value) => setFilterTab(value as 'all' | 'active' | 'completed' | 'failed' | 'delayed')} className="w-full">
                            <TabsList className="w-full justify-start">
                                <TabsTrigger value="all" className="flex-1 gap-1.5 px-2">
                                    {t('admin.jobs.filter.all', 'All')}
                                    <Badge variant="secondary" className="h-5 min-w-5 px-1 text-xs tabular-nums">
                                        {jobs.length}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="active" className="flex-1 gap-1.5 px-2">
                                    {t('admin.jobs.filter.active', 'Active')}
                                    <Badge variant="info" className="h-5 min-w-5 px-1 text-xs tabular-nums">
                                        {activeJobs.length}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="completed" className="flex-1 gap-1.5 px-2">
                                    {t('admin.jobs.filter.completed', 'Done')}
                                    <Badge variant="success" className="h-5 min-w-5 px-1 text-xs tabular-nums">
                                        {completedJobs.length}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="failed" className="flex-1 gap-1.5 px-2">
                                    {t('admin.jobs.filter.failed', 'Failed')}
                                    <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs tabular-nums">
                                        {failedJobs.length}
                                    </Badge>
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {/* Job List */}
                    <ScrollArea className="flex-1 p-3">
                        {isLoading && jobs.length === 0 ? (
                            <div role="status" className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                                <Loader2 className="size-4 mr-2 animate-spin" aria-hidden="true" />
                                {t('admin.jobs.loading', 'Loading...')}
                            </div>
                        ) : filteredJobs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 h-32 text-sm text-muted-foreground">
                                <CheckCircle2 className="size-6" aria-hidden="true" />
                                {t('admin.jobs.noJobs', 'No jobs')}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <AnimatePresence initial={false}>
                                    {filteredJobs.map((job) => (
                                        <m.div
                                            key={job.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ duration: 0.2, layout: { duration: 0.2 } }}
                                            className="bg-background border rounded-lg p-3 space-y-2"
                                        >
                                            {/* Job Header */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                                        {statusIcons[job.status]}
                                                        <span className="text-sm font-medium truncate">
                                                            {t(getJobTranslationKey(job.type))}
                                                        </span>
                                                        {job.id.startsWith('repeat:') && (
                                                            <Badge variant="outline" className="text-xs h-5 px-1.5">
                                                                <RefreshCw className="size-3 mr-0.5" />
                                                                {t('admin.jobs.recurring', 'Recurring')}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {formatDate(job.createdAt, t, i18n.language)}
                                                    </div>
                                                </div>
                                                <Badge variant={statusBadgeVariants[job.status]} className="text-xs h-6 shrink-0">
                                                    {job.id.startsWith('repeat:') && job.status === 'delayed' && job.nextRunAt
                                                        ? formatNextRunDate(job.nextRunAt, i18n.language)
                                                        : t(`admin.jobs.status.${job.status}`)}
                                                </Badge>
                                            </div>

                                            {/* Progress Bar */}
                                            {(job.status === 'active' || job.status === 'waiting') && (
                                                <AnimatedProgress
                                                    value={job.progress}
                                                    variant={progressVariants[job.status]}
                                                    showValue
                                                    className="h-1.5"
                                                    size="sm"
                                                />
                                            )}

                                            {/* Error Message */}
                                            {job.status === 'failed' && job.error && (
                                                <div className="text-xs text-error break-words line-clamp-3">
                                                    {job.error}
                                                </div>
                                            )}

                                            {/* Actions */}
                                            {!job.id.startsWith('repeat:') && (job.status === 'waiting' || job.status === 'active' || job.status === 'delayed') && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleCancelJob(job.id)}
                                                    className="w-full h-(--control-h)"
                                                >
                                                    <XCircle className="size-4" />
                                                    {t('admin.jobs.cancel', 'Cancel')}
                                                </Button>
                                            )}
                                            {!job.id.startsWith('repeat:') && (job.status === 'completed' || job.status === 'failed') && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleCancelJob(job.id)}
                                                    className="w-full h-(--control-h) text-muted-foreground hover:text-destructive"
                                                >
                                                    <Trash2 className="size-4" />
                                                    {t('admin.jobs.remove', 'Remove')}
                                                </Button>
                                            )}
                                        </m.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </ScrollArea>

                    {/* Refresh Button */}
                    <div className="p-3 border-t pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                        <Button
                            variant="outline"
                            onClick={() => fetchJobs()}
                            disabled={isLoading}
                            className="w-full"
                        >
                            <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
                            {t('admin.jobs.refresh', 'Refresh')}
                        </Button>
                    </div>
                </>
            )
            }
            </m.div>
            <ConfirmDialog
                open={confirmClearOpen}
                onOpenChange={setConfirmClearOpen}
                title={t('admin.jobs.clearConfirm.title')}
                description={t('admin.jobs.clearConfirm.description')}
                confirmLabel={t('admin.jobs.clearAll', 'Clear')}
                cancelLabel={t('common.cancel')}
                destructive
                onConfirm={handleClearAll}
            />
        </>
    )
}
