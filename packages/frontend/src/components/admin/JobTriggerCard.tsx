import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const [screenshotsPerGame, setScreenshotsPerGame] = useState(5)
  const [minMetacritic, setMinMetacritic] = useState(70)

  const isGamesImport = type === 'import-games'

  const handleStart = async () => {
    setIsLoading(true)
    try {
      if (isGamesImport) {
        await createImportGamesJob(targetGames, screenshotsPerGame, minMetacritic)
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
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-center gap-3">
          {isGamesImport ? (
            <Gamepad2 className="h-5 w-5 sm:h-6 sm:w-6 text-neon-purple shrink-0" />
          ) : (
            <Download className="h-5 w-5 sm:h-6 sm:w-6 text-neon-pink shrink-0" />
          )}
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg">
              {isGamesImport ? t('admin.jobs.importGames') : t('admin.jobs.importScreenshots')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {isGamesImport
                ? t('admin.jobs.importGamesDesc')
                : t('admin.jobs.importScreenshotsDesc')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      {isGamesImport && (
        <CardContent className="space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-normal">
                {t('admin.jobs.targetGames')}
              </Label>
              <Input
                type="number"
                value={targetGames}
                onChange={(e) => setTargetGames(parseInt(e.target.value) || 50)}
                min={1}
                max={500}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground font-normal">
                {t('admin.jobs.screenshotsPerGame')}
              </Label>
              <Input
                type="number"
                value={screenshotsPerGame}
                onChange={(e) => setScreenshotsPerGame(parseInt(e.target.value) || 5)}
                min={1}
                max={10}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground font-normal">
              {t('admin.jobs.minMetacritic')}
            </Label>
            <Input
              type="number"
              value={minMetacritic}
              onChange={(e) => setMinMetacritic(parseInt(e.target.value) || 70)}
              min={0}
              max={100}
            />
          </div>
        </CardContent>
      )}

      <CardFooter className="p-4 sm:p-6 pt-0 sm:pt-0">
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
