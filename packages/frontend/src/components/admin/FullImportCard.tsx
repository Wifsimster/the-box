import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useAdminStore } from '@/stores/adminStore'
import { Database, Play, Pause, Loader2, RefreshCw } from 'lucide-react'

export function FullImportCard() {
  const { t } = useTranslation()
  const {
    currentImport,
    fullImportLoading,
    fullImportError,
    fetchCurrentImport,
    startFullImport,
    pauseFullImport,
    resumeFullImport,
  } = useAdminStore()

  // Configuration state
  const [batchSize, setBatchSize] = useState(100)
  const [screenshotsPerGame, setScreenshotsPerGame] = useState(3)
  const [minMetacritic, setMinMetacritic] = useState(70)

  // Fetch current import on mount
  useEffect(() => {
    fetchCurrentImport()
  }, [fetchCurrentImport])

  // Calculate progress
  const progress = currentImport?.totalGamesAvailable
    ? Math.round((currentImport.gamesProcessed / currentImport.totalGamesAvailable) * 100)
    : 0

  // Estimate time remaining (rough estimate based on average)
  const getEstimatedTime = () => {
    if (!currentImport || !currentImport.totalGamesAvailable || currentImport.gamesProcessed === 0) {
      return null
    }
    // Assume roughly 3 seconds per game due to rate limiting
    const remainingGames = currentImport.totalGamesAvailable - currentImport.gamesProcessed
    const estimatedSeconds = remainingGames * 3
    if (estimatedSeconds < 60) {
      return `< 1 min`
    }
    if (estimatedSeconds < 3600) {
      const minutes = Math.ceil(estimatedSeconds / 60)
      return `~${minutes} min`
    }
    const hours = Math.floor(estimatedSeconds / 3600)
    const minutes = Math.ceil((estimatedSeconds % 3600) / 60)
    return `~${hours}h ${minutes}min`
  }

  const handleStart = async () => {
    try {
      await startFullImport({ batchSize, screenshotsPerGame, minMetacritic })
    } catch (error) {
      console.error('Failed to start full import:', error)
    }
  }

  const handlePause = async () => {
    try {
      await pauseFullImport()
    } catch (error) {
      console.error('Failed to pause import:', error)
    }
  }

  const handleResume = async () => {
    try {
      await resumeFullImport()
    } catch (error) {
      console.error('Failed to resume import:', error)
    }
  }

  const getStatusBadge = () => {
    if (!currentImport) return null

    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      in_progress: 'default',
      paused: 'secondary',
      completed: 'default',
      failed: 'destructive',
    }

    const labels: Record<string, string> = {
      pending: t('admin.fullImport.status.pending'),
      in_progress: t('admin.fullImport.status.inProgress'),
      paused: t('admin.fullImport.status.paused'),
      completed: t('admin.fullImport.status.completed'),
      failed: t('admin.fullImport.status.failed'),
    }

    return (
      <Badge variant={variants[currentImport.status] || 'outline'}>
        {labels[currentImport.status] || currentImport.status}
      </Badge>
    )
  }

  const canStart = !currentImport || currentImport.status === 'completed' || currentImport.status === 'failed'
  const canPause = currentImport?.status === 'in_progress'
  const canResume = currentImport?.status === 'paused'

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-neon-purple/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="h-6 w-6 text-neon-purple" />
            <div>
              <CardTitle>{t('admin.fullImport.title')}</CardTitle>
              <CardDescription>{t('admin.fullImport.description')}</CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress section - shown when import exists and is active/paused */}
        {currentImport && (currentImport.status === 'in_progress' || currentImport.status === 'paused') && (
          <div className="space-y-3 p-4 rounded-lg bg-background/50">
            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{t('admin.fullImport.progress')}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.fullImport.totalAvailable')}:</span>
                <span>{currentImport.totalGamesAvailable?.toLocaleString() || '...'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.fullImport.processed')}:</span>
                <span>{currentImport.gamesProcessed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.fullImport.imported')}:</span>
                <span className="text-green-500">{currentImport.gamesImported.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.fullImport.skipped')}:</span>
                <span className="text-yellow-500">{currentImport.gamesSkipped.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.fullImport.screenshots')}:</span>
                <span>{currentImport.screenshotsDownloaded.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('admin.fullImport.batch')}:</span>
                <span>{currentImport.currentBatch} / {currentImport.totalBatchesEstimated || '?'}</span>
              </div>
            </div>

            {/* Estimated time */}
            {getEstimatedTime() && currentImport.status === 'in_progress' && (
              <div className="text-sm text-muted-foreground">
                {t('admin.fullImport.estimatedTime')}: {getEstimatedTime()}
              </div>
            )}
          </div>
        )}

        {/* Completed summary */}
        {currentImport?.status === 'completed' && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
            <p className="text-green-500 font-medium">{t('admin.fullImport.completedMessage')}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {currentImport.gamesImported.toLocaleString()} {t('admin.fullImport.gamesImported')}, {currentImport.gamesSkipped.toLocaleString()} {t('admin.fullImport.gamesSkippedSuffix')}
            </p>
          </div>
        )}

        {/* Error display */}
        {fullImportError && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-red-500 text-sm">{fullImportError}</p>
          </div>
        )}

        {/* Configuration form - only when no active import */}
        {canStart && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  {t('admin.fullImport.batchSize')}
                </label>
                <Input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
                  min={10}
                  max={500}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  {t('admin.jobs.screenshotsPerGame')}
                </label>
                <Input
                  type="number"
                  value={screenshotsPerGame}
                  onChange={(e) => setScreenshotsPerGame(parseInt(e.target.value) || 3)}
                  min={1}
                  max={10}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  {t('admin.jobs.minMetacritic')}
                </label>
                <Input
                  type="number"
                  value={minMetacritic}
                  onChange={(e) => setMinMetacritic(parseInt(e.target.value) || 70)}
                  min={0}
                  max={100}
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        {/* Start button */}
        {canStart && (
          <Button
            variant="gaming"
            onClick={handleStart}
            disabled={fullImportLoading}
            className="flex-1"
          >
            {fullImportLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                {t('admin.fullImport.startImport')}
              </>
            )}
          </Button>
        )}

        {/* Pause button */}
        {canPause && (
          <Button
            variant="secondary"
            onClick={handlePause}
            disabled={fullImportLoading}
            className="flex-1"
          >
            {fullImportLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-2" />
                {t('admin.fullImport.pause')}
              </>
            )}
          </Button>
        )}

        {/* Resume button */}
        {canResume && (
          <Button
            variant="gaming"
            onClick={handleResume}
            disabled={fullImportLoading}
            className="flex-1"
          >
            {fullImportLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('admin.fullImport.resume')}
              </>
            )}
          </Button>
        )}

        {/* Refresh button when active */}
        {(currentImport?.status === 'in_progress' || currentImport?.status === 'paused') && (
          <Button
            variant="outline"
            size="icon"
            onClick={fetchCurrentImport}
            disabled={fullImportLoading}
          >
            <RefreshCw className={`h-4 w-4 ${fullImportLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
