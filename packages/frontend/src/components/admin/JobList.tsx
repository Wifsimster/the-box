import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { useAdminStore } from '@/stores/adminStore'
import { FullImportCard } from './FullImportCard'
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
  Gamepad2,
  Download,
} from 'lucide-react'
import type { JobStatus } from '@/types'

const statusIcons: Record<JobStatus, React.ReactNode> = {
  waiting: <Clock className="h-4 w-4 text-yellow-500" />,
  active: <Play className="h-4 w-4 text-blue-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  delayed: <Pause className="h-4 w-4 text-orange-500" />,
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

export function JobList() {
  const { t } = useTranslation()
  const {
    jobs,
    isLoading,
    cancelJob,
    clearCompleted,
    recurringJobs,
    triggerSyncJob,
    triggerImportGames,
    triggerImportScreenshots,
  } = useAdminStore()

  // State for manual task configurations
  const [importGamesConfig, setImportGamesConfig] = useState({
    targetGames: 50,
    screenshotsPerGame: 3,
  })
  const [importScreenshotsLoading, setImportScreenshotsLoading] = useState(false)
  const [importGamesLoading, setImportGamesLoading] = useState(false)

  const completedCount = jobs.filter((j) => j.status === 'completed').length
  const syncJob = recurringJobs.find((j) => j.name === 'sync-new-games')

  const handleImportGames = async () => {
    setImportGamesLoading(true)
    try {
      await triggerImportGames(importGamesConfig.targetGames, importGamesConfig.screenshotsPerGame)
    } finally {
      setImportGamesLoading(false)
    }
  }

  const handleImportScreenshots = async () => {
    setImportScreenshotsLoading(true)
    try {
      await triggerImportScreenshots()
    } finally {
      setImportScreenshotsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Full Import */}
      <FullImportCard />

      {/* Manual Tasks */}
      <Card className="bg-card/50 backdrop-blur-sm border-neon-blue/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="h-4 w-4 text-neon-blue" />
            {t('admin.jobs.manualTasks')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Import Games Task */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Gamepad2 className="h-5 w-5 text-neon-purple" />
                <div>
                  <span className="text-sm font-medium">{t('admin.jobs.importGames')}</span>
                  <p className="text-xs text-muted-foreground">{t('admin.jobs.importGamesDesc')}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t('admin.jobs.targetGames')}
                </label>
                <Input
                  type="number"
                  value={importGamesConfig.targetGames}
                  onChange={(e) => setImportGamesConfig(prev => ({
                    ...prev,
                    targetGames: parseInt(e.target.value) || 50
                  }))}
                  min={1}
                  max={500}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t('admin.jobs.screenshotsPerGame')}
                </label>
                <Input
                  type="number"
                  value={importGamesConfig.screenshotsPerGame}
                  onChange={(e) => setImportGamesConfig(prev => ({
                    ...prev,
                    screenshotsPerGame: parseInt(e.target.value) || 3
                  }))}
                  min={1}
                  max={10}
                  className="h-8"
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportGames}
              disabled={importGamesLoading}
              className="w-full border-neon-purple/30 hover:bg-neon-purple/10"
            >
              {importGamesLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              {t('admin.jobs.runNow')}
            </Button>
          </div>

          {/* Import Screenshots Task */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-neon-pink" />
                <div>
                  <span className="text-sm font-medium">{t('admin.jobs.importScreenshots')}</span>
                  <p className="text-xs text-muted-foreground">{t('admin.jobs.importScreenshotsDesc')}</p>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportScreenshots}
              disabled={importScreenshotsLoading}
              className="w-full border-neon-pink/30 hover:bg-neon-pink/10"
            >
              {importScreenshotsLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              {t('admin.jobs.runNow')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recurring Jobs Status */}
      {syncJob && (
        <Card className="bg-card/50 backdrop-blur-sm border-neon-purple/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4 text-neon-purple" />
              {t('admin.jobs.recurringJobs')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                {syncJob.isActive ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span className="text-sm font-medium text-blue-400">
                      {t('admin.jobs.syncRunning')}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">
                      {t('admin.jobs.syncNewGames')}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {syncJob.every && (
                    <span>{t('admin.jobs.every')} {formatInterval(syncJob.every)}</span>
                  )}
                  {syncJob.nextRun && !syncJob.isActive && (
                    <span className="text-neon-purple">
                      {t('admin.jobs.nextRun')}: {formatRelativeTime(syncJob.nextRun)}
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerSyncJob()}
                  disabled={syncJob.isActive}
                  className="border-neon-purple/30 hover:bg-neon-purple/10"
                >
                  <Play className="h-4 w-4 mr-1" />
                  {t('admin.jobs.runNow')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job History */}
      <Card className="bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('admin.jobs.title')}</CardTitle>
          {completedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCompleted}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t('admin.jobs.clearCompleted')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t('admin.jobs.noJobs')}
            </p>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col gap-3 p-4 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {statusIcons[job.status]}
                      <div>
                        <p className="font-medium">
                          {job.type === 'import-games'
                            ? t('admin.jobs.importGames')
                            : job.type === 'sync-new-games'
                              ? t('admin.jobs.syncNewGames')
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
                      <span
                        className={`text-sm px-2 py-1 rounded ${job.status === 'completed'
                          ? 'bg-green-500/20 text-green-400'
                          : job.status === 'failed'
                            ? 'bg-red-500/20 text-red-400'
                            : job.status === 'active'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                      >
                        {t(`admin.jobs.status.${job.status}`)}
                      </span>
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
                    <div className="space-y-1">
                      <Progress value={job.progress} />
                      <p className="text-xs text-muted-foreground text-right">
                        {job.progress}%
                      </p>
                    </div>
                  )}

                  {job.status === 'completed' && job.result && (
                    <p className="text-sm text-muted-foreground">
                      {job.result.message}
                    </p>
                  )}

                  {job.status === 'failed' && job.error && (
                    <p className="text-sm text-red-400">{job.error}</p>
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
