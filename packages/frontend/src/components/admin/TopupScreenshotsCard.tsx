import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useAdminStore } from '@/stores/adminStore'
import { Images, Play, Pause, Loader2, RefreshCw, X } from 'lucide-react'

export function TopupScreenshotsCard() {
  const { t, i18n } = useTranslation()
  const {
    currentTopupScreenshots,
    topupScreenshotsLoading,
    topupScreenshotsError,
    fetchCurrentTopupScreenshots,
    startTopupScreenshots,
    pauseTopupScreenshots,
    resumeTopupScreenshots,
    cancelTopupScreenshots,
  } = useAdminStore()

  const [batchSize, setBatchSize] = useState(50)
  const [targetScreenshotsPerGame, setTargetScreenshotsPerGame] = useState(5)

  useEffect(() => {
    fetchCurrentTopupScreenshots()
  }, [fetchCurrentTopupScreenshots])

  const progress = currentTopupScreenshots?.totalGamesAvailable
    ? Math.round((currentTopupScreenshots.gamesProcessed / currentTopupScreenshots.totalGamesAvailable) * 100)
    : 0

  const handleStart = async () => {
    try {
      await startTopupScreenshots({ batchSize, targetScreenshotsPerGame })
    } catch (error) {
      console.error('Failed to start topup-screenshots:', error)
    }
  }

  const handlePause = async () => {
    try {
      await pauseTopupScreenshots()
    } catch (error) {
      console.error('Failed to pause topup-screenshots:', error)
    }
  }

  const handleResume = async () => {
    try {
      await resumeTopupScreenshots()
    } catch (error) {
      console.error('Failed to resume topup-screenshots:', error)
    }
  }

  const handleCancel = async () => {
    try {
      await cancelTopupScreenshots()
    } catch (error) {
      console.error('Failed to cancel topup-screenshots:', error)
    }
  }

  const getStatusBadge = () => {
    if (!currentTopupScreenshots) return null

    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      in_progress: 'default',
      paused: 'secondary',
      completed: 'default',
      failed: 'destructive',
    }

    return (
      <Badge variant={variants[currentTopupScreenshots.status] || 'outline'}>
        {currentTopupScreenshots.status}
      </Badge>
    )
  }

  const canStart =
    !currentTopupScreenshots ||
    currentTopupScreenshots.status === 'completed' ||
    currentTopupScreenshots.status === 'failed'
  const canPause = currentTopupScreenshots?.status === 'in_progress'
  const canResume = currentTopupScreenshots?.status === 'paused'
  const canCancel =
    currentTopupScreenshots?.status === 'in_progress' || currentTopupScreenshots?.status === 'paused'

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-neon-purple/30">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Images className="h-5 w-5 sm:h-6 sm:w-6 text-neon-purple shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">
                {t('admin.topupScreenshots.title', 'Top-Up Screenshots')}
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {t(
                  'admin.topupScreenshots.description',
                  'Backfill existing games up to the target number of captures by pulling missing screenshots from RAWG.'
                )}
              </CardDescription>
            </div>
          </div>
          <div className="self-start sm:self-auto">{getStatusBadge()}</div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
        {currentTopupScreenshots &&
          (currentTopupScreenshots.status === 'in_progress' || currentTopupScreenshots.status === 'paused') && (
            <div className="space-y-3 p-3 sm:p-4 rounded-lg bg-background/50">
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{t('admin.fullImport.progress', 'Progress')}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('admin.topupScreenshots.candidates', 'Candidates')}:
                  </span>
                  <span>
                    {currentTopupScreenshots.totalGamesAvailable?.toLocaleString(i18n.language) || '...'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('admin.fullImport.processed', 'Processed')}:
                  </span>
                  <span>{currentTopupScreenshots.gamesProcessed.toLocaleString(i18n.language)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('admin.topupScreenshots.toppedUp', 'Topped up')}:
                  </span>
                  <span className="text-success">
                    {currentTopupScreenshots.gamesImported.toLocaleString(i18n.language)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('admin.fullImport.skipped', 'Skipped')}:
                  </span>
                  <span className="text-warning">
                    {currentTopupScreenshots.gamesSkipped.toLocaleString(i18n.language)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('admin.fullImport.screenshots', 'Screenshots')}:
                  </span>
                  <span>
                    {currentTopupScreenshots.screenshotsDownloaded.toLocaleString(i18n.language)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('admin.fullImport.batch', 'Batch')}:
                  </span>
                  <span>
                    {currentTopupScreenshots.currentBatch} /{' '}
                    {currentTopupScreenshots.totalBatchesEstimated || '?'}
                  </span>
                </div>
              </div>
            </div>
          )}

        {currentTopupScreenshots?.status === 'completed' && (
          <div className="p-4 rounded-lg bg-success/10 border border-success/30">
            <p className="text-success font-medium">
              {t('admin.topupScreenshots.completed', 'Top-up complete')}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {currentTopupScreenshots.gamesImported.toLocaleString()} {t('admin.topupScreenshots.gamesToppedUp', 'games topped up')},{' '}
              {currentTopupScreenshots.screenshotsDownloaded.toLocaleString()}{' '}
              {t('admin.topupScreenshots.newScreenshots', 'new screenshots')}
            </p>
          </div>
        )}

        {topupScreenshotsError && (
          <div className="p-4 rounded-lg bg-error/10 border border-error/30">
            <p className="text-error text-sm">{topupScreenshotsError}</p>
          </div>
        )}

        {canStart && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-normal">
                {t('admin.fullImport.batchSize', 'Batch size')}
              </Label>
              <Input
                type="number"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 50)}
                min={10}
                max={500}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground font-normal">
                {t('admin.topupScreenshots.targetPerGame', 'Target captures per game')}
              </Label>
              <Input
                type="number"
                value={targetScreenshotsPerGame}
                onChange={(e) =>
                  setTargetScreenshotsPerGame(parseInt(e.target.value) || 5)
                }
                min={1}
                max={10}
              />
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row gap-2 p-4 sm:p-6 pt-0 sm:pt-0">
        {canStart && (
          <Button
            variant="gaming"
            onClick={handleStart}
            disabled={topupScreenshotsLoading}
            className="flex-1"
          >
            {topupScreenshotsLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('common.loading', 'Loading')}
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                {t('admin.topupScreenshots.start', 'Start top-up')}
              </>
            )}
          </Button>
        )}

        {canPause && (
          <Button
            variant="secondary"
            onClick={handlePause}
            disabled={topupScreenshotsLoading}
            className="flex-1"
          >
            {topupScreenshotsLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('common.loading', 'Loading')}
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-2" />
                {t('admin.fullImport.pause', 'Pause')}
              </>
            )}
          </Button>
        )}

        {canResume && (
          <Button
            variant="gaming"
            onClick={handleResume}
            disabled={topupScreenshotsLoading}
            className="flex-1"
          >
            {topupScreenshotsLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('common.loading', 'Loading')}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('admin.fullImport.resume', 'Resume')}
              </>
            )}
          </Button>
        )}

        {canCancel && (
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={topupScreenshotsLoading}
            className="w-full sm:w-auto"
          >
            <X className="h-4 w-4 mr-2" />
            {t('common.cancel', 'Cancel')}
          </Button>
        )}

        {(currentTopupScreenshots?.status === 'in_progress' ||
          currentTopupScreenshots?.status === 'paused') && (
          <Button
            variant="outline"
            size="icon"
            onClick={fetchCurrentTopupScreenshots}
            disabled={topupScreenshotsLoading}
            className="w-full sm:w-10"
          >
            <RefreshCw className={`h-4 w-4 ${topupScreenshotsLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
