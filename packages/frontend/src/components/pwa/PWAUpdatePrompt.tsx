import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PWAUpdatePrompt() {
  const { t, i18n } = useTranslation()
  const offlineToastShown = useRef(false)
  const [refreshing, setRefreshing] = useState(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()

  // Push the active i18n language down to the service worker so the push
  // fallback notification (shown when the server delivers a malformed or
  // empty payload) matches the user's UI language. Re-fired on language
  // switch so the SW always has the current value cached.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const send = (locale: string): void => {
      navigator.serviceWorker.controller?.postMessage({ type: 'SET_LOCALE', locale })
    }
    send(i18n.language)
    const onLangChange = (lang: string): void => send(lang)
    i18n.on('languageChanged', onLangChange)
    return () => {
      i18n.off('languageChanged', onLangChange)
    }
  }, [i18n])

  useEffect(() => {
    if (offlineReady && !offlineToastShown.current) {
      offlineToastShown.current = true
      toast.success(t('pwa.offlineReady'), {
        duration: 4000,
        onAutoClose: () => setOfflineReady(false),
        onDismiss: () => setOfflineReady(false),
      })
    }
  }, [offlineReady, setOfflineReady, t])

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await updateServiceWorker(true)
    } catch {
      setRefreshing(false)
    }
  }

  const handleDismiss = (): void => {
    setNeedRefresh(false)
  }

  if (!needRefresh) return null

  return (
    <div
      role="dialog"
      aria-labelledby="pwa-update-panel-title"
      aria-describedby="pwa-update-panel-desc"
      aria-live="polite"
      className={cn(
        // Sit just above the mobile BottomNav; drop to the corner at md where
        // the BottomNav is hidden.
        'fixed inset-x-3 bottom-[var(--bottom-nav-space)] z-[55] rounded-xl border bg-card/95 shadow-lg backdrop-blur md:bottom-3',
        'border-primary/30 p-4 flex gap-3 items-start sm:max-w-md sm:left-auto sm:right-3',
      )}
    >
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"
        aria-hidden="true"
      >
        <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          id="pwa-update-panel-title"
          className="text-sm font-semibold text-foreground"
        >
          {t('pwa.updatePanel.title')}
        </p>
        <p
          id="pwa-update-panel-desc"
          className="mt-1 text-xs text-muted-foreground"
        >
          {t('pwa.updatePanel.description')}
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw
              className={cn('size-4 mr-1.5', refreshing && 'animate-spin')}
              aria-hidden="true"
            />
            {refreshing ? t('pwa.updatePanel.refreshing') : t('pwa.updatePanel.refresh')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            disabled={refreshing}
          >
            {t('pwa.updatePanel.later')}
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        disabled={refreshing}
        aria-label={t('pwa.updatePanel.dismiss')}
        className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
