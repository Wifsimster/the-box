import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAdminStore } from '@/stores/adminStore'
import {
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  Pause,
  Trash2,
  Loader2,
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

export function JobList() {
  const { t } = useTranslation()
  const { jobs, isLoading, cancelJob, clearCompleted } = useAdminStore()

  const completedCount = jobs.filter((j) => j.status === 'completed').length

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
                          : t('admin.jobs.importScreenshots')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(job.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm px-2 py-1 rounded ${
                        job.status === 'completed'
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

                {job.data && (job.data.targetGames || job.data.screenshotsPerGame) && (
                  <div className="text-xs text-muted-foreground">
                    {job.data.targetGames && (
                      <span className="mr-3">
                        {t('admin.jobs.targetGames')}: {job.data.targetGames}
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
  )
}
