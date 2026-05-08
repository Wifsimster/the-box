import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell, Loader2 } from 'lucide-react'
import { useWebPush } from '@/hooks/useWebPush'
import { toast } from '@/lib/toast'

export function PushNotificationCard() {
  const { t } = useTranslation()
  const {
    isSupported,
    isServerConfigured,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  } = useWebPush()

  // Don't render the card at all if there's nothing the user can do here:
  // unsupported browser (Firefox on iOS, etc.) or server lacks VAPID keys.
  if (!isSupported || isServerConfigured === false) return null

  const handleToggle = async (next: boolean) => {
    try {
      if (next) {
        await subscribe()
        if (Notification.permission === 'granted') {
          toast.success(t('pushNotifications.optedIn'))
        } else if (Notification.permission === 'denied') {
          toast.error(t('pushNotifications.permissionDenied'))
        }
      } else {
        await unsubscribe()
        toast.success(t('pushNotifications.optedOut'))
      }
    } catch (err) {
      toast.error(t('pushNotifications.updateError'))
      console.error('Failed to update push subscription:', err)
    }
  }

  // The browser blocked us at OS/site level — flipping the toggle won't help,
  // the user has to clear the block in browser settings. Show a read-only
  // hint instead of an interactive control.
  const isPermanentlyDenied = permission === 'denied' && !isSubscribed

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t('pushNotifications.title')}
        </CardTitle>
        <CardDescription>{t('pushNotifications.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isPermanentlyDenied ? (
          <p className="text-sm text-muted-foreground">{t('pushNotifications.permissionDeniedHint')}</p>
        ) : (
          <label className="flex items-start gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={isSubscribed}
              disabled={isLoading || isServerConfigured === null}
              onChange={(e) => void handleToggle(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-background/50 accent-neon-purple cursor-pointer disabled:cursor-wait"
            />
            <span className="flex-1 space-y-1">
              <span className="block text-sm text-foreground/90 group-hover:text-foreground transition-colors">
                {t('pushNotifications.label')}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </span>
            </span>
          </label>
        )}
      </CardContent>
    </Card>
  )
}
