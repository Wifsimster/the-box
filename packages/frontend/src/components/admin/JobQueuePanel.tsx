import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AnimatedProgress } from '@/components/ui/animated-progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAdminStore } from '@/stores/adminStore'
import { Trash2, Loader2, Clock, Play, CheckCircle2, XCircle, Pause, RefreshCw } from 'lucide-react'
import type { JobStatus } from '@/types'

const statusIcons: Record<JobStatus, React.ReactNode> = {
    waiting: <Clock className="h-3 w-3 text-yellow-500" />,
    active: <Play className="h-3 w-3 text-blue-500" />,
    completed: <CheckCircle2 className="h-3 w-3 text-green-500" />,
    failed: <XCircle className="h-3 w-3 text-red-500" />,
    delayed: <Pause className="h-3 w-3 text-orange-500" />,
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
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (seconds < 60) return `${seconds}s ago`
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return date.toLocaleDateString()
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
    }
    return keyMap[jobName] || jobName
}

export function JobQueuePanel() {
    const { t } = useTranslation()
    const { jobs, isLoading, fetchJobs, clearCompleted, cancelJob, connectSocket, disconnectSocket } = useAdminStore()
    const [filterTab, setFilterTab] = useState<'all' | 'active' | 'completed' | 'failed'>('all')

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
        }
    }

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

    return (
        <div className="fixed right-0 top-14 sm:top-16 h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] w-120 border-l bg-card shadow-lg flex flex-col z-50 pointer-events-auto">
            {/* Header */}
            <div className="p-4 border-b bg-muted/50">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">{t('admin.jobs.queueTitle', 'Job Queue')}</h3>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleClearAll}
                        disabled={jobs.length === 0}
                        className="h-7 px-2 text-xs pointer-events-auto cursor-pointer"
                    >
                        <Trash2 className="h-3 w-3 mr-1" />
                        {t('admin.jobs.clearAll', 'Clear')}
                    </Button>
                </div>

                {/* Filter Tabs */}
                <Tabs value={filterTab} onValueChange={(value) => setFilterTab(value as any)} className="w-full">
                    <TabsList className="w-full h-8 p-0.5">
                        <TabsTrigger value="all" className="flex-1 text-[10px] h-7 px-2">
                            {t('admin.jobs.filter.all', 'All')}
                            <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[9px]">
                                {jobs.length}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="active" className="flex-1 text-[10px] h-7 px-2">
                            {t('admin.jobs.filter.active', 'Active')}
                            <Badge variant="info" className="ml-1 h-4 min-w-4 px-1 text-[9px]">
                                {activeJobs.length}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="completed" className="flex-1 text-[10px] h-7 px-2">
                            {t('admin.jobs.filter.completed', 'Done')}
                            <Badge variant="success" className="ml-1 h-4 min-w-4 px-1 text-[9px]">
                                {completedJobs.length}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="failed" className="flex-1 text-[10px] h-7 px-2">
                            {t('admin.jobs.filter.failed', 'Failed')}
                            <Badge variant="destructive" className="ml-1 h-4 min-w-4 px-1 text-[9px]">
                                {failedJobs.length}
                            </Badge>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Job List */}
            <ScrollArea className="flex-1 p-3">
                {isLoading && jobs.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('admin.jobs.loading', 'Loading...')}
                    </div>
                ) : filteredJobs.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                        {t('admin.jobs.noJobs', 'No jobs')}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <AnimatePresence initial={false}>
                            {filteredJobs.map((job) => (
                                <motion.div
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
                                            <div className="flex items-center gap-1.5 mb-1">
                                                {statusIcons[job.status]}
                                                <span className="text-xs font-medium truncate">
                                                    {t(getJobTranslationKey(job.type))}
                                                </span>
                                                {job.id.startsWith('repeat:') && (
                                                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                                                        <RefreshCw className="h-2 w-2 mr-0.5" />
                                                        {t('admin.jobs.recurring', 'Recurring')}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                                {formatDate(job.createdAt)}
                                            </div>
                                        </div>
                                        <Badge variant={statusBadgeVariants[job.status]} className="text-[10px] h-5">
                                            {t(`admin.jobs.status.${job.status}`)}
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
                                        <div className="text-[10px] text-red-500 truncate" title={job.error}>
                                            {job.error}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    {!job.id.startsWith('repeat:') && (job.status === 'waiting' || job.status === 'active' || job.status === 'delayed') && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCancelJob(job.id)}
                                            className="w-full h-6 text-[10px]"
                                        >
                                            <XCircle className="h-3 w-3 mr-1" />
                                            {t('admin.jobs.cancel', 'Cancel')}
                                        </Button>
                                    )}
                                    {!job.id.startsWith('repeat:') && (job.status === 'completed' || job.status === 'failed') && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCancelJob(job.id)}
                                            className="w-full h-6 text-[10px] text-muted-foreground hover:text-destructive"
                                        >
                                            <Trash2 className="h-3 w-3 mr-1" />
                                            {t('admin.jobs.remove', 'Remove')}
                                        </Button>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </ScrollArea>

            {/* Refresh Button */}
            <div className="p-3 border-t">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchJobs()}
                    disabled={isLoading}
                    className="w-full h-8 text-xs"
                >
                    <RefreshCw className={`h-3 w-3 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    {t('admin.jobs.refresh', 'Refresh')}
                </Button>
            </div>
        </div>
    )
}
