import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAdminStore } from '@/stores/adminStore'
import { Download, Gamepad2, Loader2 } from 'lucide-react'
import type { JobType } from '@/types'

interface JobTriggerCardProps {
  type: JobType
}

export function JobTriggerCard({ type }: JobTriggerCardProps) {
  const { t } = useTranslation()
  const { createImportGamesJob, createImportScreenshotsJob } = useAdminStore()

  const [isLoading, setIsLoading] = useState(false)
  const [targetGames, setTargetGames] = useState(50)
  const [screenshotsPerGame, setScreenshotsPerGame] = useState(3)

  const isGamesImport = type === 'import-games'

  const handleStart = async () => {
    setIsLoading(true)
    try {
      if (isGamesImport) {
        await createImportGamesJob(targetGames, screenshotsPerGame)
      } else {
        await createImportScreenshotsJob()
      }
    } catch (error) {
      console.error('Failed to create job:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center gap-3">
          {isGamesImport ? (
            <Gamepad2 className="h-6 w-6 text-neon-purple" />
          ) : (
            <Download className="h-6 w-6 text-neon-pink" />
          )}
          <div>
            <CardTitle>
              {isGamesImport ? t('admin.jobs.importGames') : t('admin.jobs.importScreenshots')}
            </CardTitle>
            <CardDescription>
              {isGamesImport
                ? t('admin.jobs.importGamesDesc')
                : t('admin.jobs.importScreenshotsDesc')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      {isGamesImport && (
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              {t('admin.jobs.targetGames')}
            </label>
            <Input
              type="number"
              value={targetGames}
              onChange={(e) => setTargetGames(parseInt(e.target.value) || 50)}
              min={1}
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
        </CardContent>
      )}

      <CardFooter>
        <Button
          variant="gaming"
          onClick={handleStart}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </>
          ) : (
            t('admin.jobs.startJob')
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
