import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminStore } from '@/stores/adminStore'
import { Dices, Loader2, Calendar } from 'lucide-react'
import { toast } from '@/lib/toast'

export function ChallengeManager() {
  const { t } = useTranslation()
  const { rerollLoading, rerollDailyChallenge } = useAdminStore()
  const [isConfirming, setIsConfirming] = useState(false)
  const [minMetacritic, setMinMetacritic] = useState(85)

  const today = new Date().toISOString().split('T')[0]

  const handleReroll = async () => {
    if (!isConfirming) {
      setIsConfirming(true)
      return
    }

    try {
      await rerollDailyChallenge(undefined, minMetacritic)
      toast.success(t('admin.challenges.rerollSuccess'))
      setIsConfirming(false)
    } catch {
      toast.error(t('admin.challenges.rerollError'))
      setIsConfirming(false)
    }
  }

  const handleCancel = () => {
    setIsConfirming(false)
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-neon-purple/30">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-start sm:items-center gap-3">
          <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-neon-purple flex-shrink-0 mt-0.5 sm:mt-0" />
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base sm:text-lg">{t('admin.challenges.todaysChallenge')}</CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-1">{t('admin.challenges.rerollDesc')}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-6 pt-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted-foreground">
          <span>{t('admin.challenges.date')}:</span>
          <span className="font-mono text-foreground">{today}</span>
        </div>
        <div className="space-y-2">
          <Label className="text-muted-foreground font-normal text-sm">
            {t('admin.jobs.minMetacritic')}
          </Label>
          <Input
            type="number"
            value={minMetacritic}
            onChange={(e) => {
              const value = parseInt(e.target.value) || 85
              setMinMetacritic(Math.max(70, Math.min(100, value)))
            }}
            min={70}
            max={100}
            disabled={isConfirming || rerollLoading}
            className="w-full"
          />
        </div>
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row gap-2 p-4 sm:p-6 pt-0">
        {isConfirming ? (
          <>
            <Button
              variant="destructive"
              onClick={handleReroll}
              disabled={rerollLoading}
              className="w-full sm:flex-1"
            >
              {rerollLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <Dices className="h-4 w-4 mr-2" />
                  {t('admin.challenges.confirmReroll')}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={rerollLoading}
              className="w-full sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <Button
            variant="gaming"
            onClick={handleReroll}
            className="w-full"
          >
            <Dices className="h-4 w-4 mr-2" />
            {t('admin.challenges.reroll')}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
