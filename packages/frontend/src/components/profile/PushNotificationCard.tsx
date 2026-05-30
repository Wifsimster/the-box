import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell, Loader2 } from 'lucide-react'
import { useWebPush } from '@/hooks/useWebPush'
import { PushApiError } from '@/lib/api/push'
import { toast } from '@/lib/toast'

// Map the typed PushApiError codes (and the DOM exception name browsers
// throw on permission denial) to localized toast keys. Keep this exhaustive
// so the user always sees something more specific than "try again later".
function toastKeyForError(err: unknown): string {
  if (err instanceof PushApiError) {
    switch (err.code) {
      case 'PERMISSION_DENIED':
        return 'pushNotifications.permissionDenied'
      case 'PUSH_DEVICE_CAP_REACHED':
        return 'pushNotifications.deviceLimitReached'
      case 'SERVER_UNAVAILABLE':
      case 'PUSH_NOT_CONFIGURED':
        return 'pushNotifications.serverUnavailable'
      case 'NETWORK_ERROR':
        return 'pushNotifications.networkError'
      case 'RATE_LIMITED':
        return 'pushNotifications.updateError'
      default:
        return 'pushNotifications.updateError'
    }
  }
  if (err instanceof Error && err.name === 'NotAllowedError') {
    return 'pushNotifications.permissionDenied'
  }
  return 'pushNotifications.updateError'
}

export function PushNotificationCard() {
  const { t } = useTranslation()
  const descId = useId()
  const labelId = useId()
  const {
    isSupported,
    requiresPwaInstall,
    isServerConfigured,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  } = useWebPush()

  // iOS Safari outside an installed PWA: show a static hint instead of a
  // toggle that would just throw on click.
  if (requiresPwaInstall) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-5" />
            {t('pushNotifications.title')}
          </CardTitle>
          <CardDescription>{t('pushNotifications.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('pushNotifications.iosInstallHint')}</p>
        </CardContent>
      </Card>
    )
  }

  // Don't render the card at all if there's nothing the user can do here:
  // unsupported browser (Firefox on iOS, etc.) or server lacks VAPID keys.
  // `isServerConfigured === null` means we're still probing — also hide so
  // we don't flicker the toggle in then out as the probe completes.
  if (!isSupported || isServerConfigured !== true) return null

  const handleToggle = async (next: boolean) => {
    try {
      if (next) {
        await subscribe()
        toast.success(t('pushNotifications.optedIn'))
      } else {
        await unsubscribe()
        toast.success(t('pushNotifications.optedOut'))
      }
    } catch (err) {
      toast.error(t(toastKeyForError(err)))
    }
  }

  // The browser blocked us at OS/site level — flipping the toggle won't help,
  // the user has to clear the block in browser settings. Show a read-only
  // hint regardless of whether a stale subscription is still on file.
  const isPermanentlyDenied = permission === 'denied'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-5" />
          {t('pushNotifications.title')}
        </CardTitle>
        <CardDescription id={descId}>{t('pushNotifications.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isPermanentlyDenied ? (
          <p className="text-sm text-muted-foreground">{t('pushNotifications.permissionDeniedHint')}</p>
        ) : (
          <label className="flex items-start gap-3 cursor-pointer select-none group" htmlFor={labelId}>
            <input
              id={labelId}
              type="checkbox"
              checked={isSubscribed}
              disabled={isLoading}
              aria-busy={isLoading}
              aria-describedby={descId}
              onChange={(e) => void handleToggle(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-white/20 bg-background/50 accent-neon-purple cursor-pointer disabled:cursor-wait"
            />
            <span className="flex-1 space-y-1">
              <span className="block text-sm text-foreground/90 group-hover:text-foreground transition-colors">
                {t('pushNotifications.label')}
              </span>
              {isLoading && (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  <span className="sr-only">{t('pushNotifications.updating')}</span>
                </span>
              )}
            </span>
          </label>
        )}
      </CardContent>
    </Card>
  )
}
