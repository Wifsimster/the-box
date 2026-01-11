import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAdminStore } from '@/stores/adminStore'
import { Dices, Loader2, Calendar } from 'lucide-react'
import { toast } from '@/lib/toast'

export function ChallengeManager() {
  const { t } = useTranslation()
  const { rerollLoading, rerollDailyChallenge } = useAdminStore()
  const [isConfirming, setIsConfirming] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const handleReroll = async () => {
    if (!isConfirming) {
      setIsConfirming(true)
      return
    }

    try {
      await rerollDailyChallenge()
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
      <CardHeader>
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-neon-purple" />
          <div>
            <CardTitle>{t('admin.challenges.todaysChallenge')}</CardTitle>
            <CardDescription>{t('admin.challenges.rerollDesc')}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t('admin.challenges.date')}:</span>
          <span className="font-mono text-foreground">{today}</span>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        {isConfirming ? (
          <>
            <Button
              variant="destructive"
              onClick={handleReroll}
              disabled={rerollLoading}
              className="flex-1"
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
