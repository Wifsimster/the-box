import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

const DISMISS_KEY = 'pwa:install-banner-dismissed-at'
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 30
const SHOW_DELAY_MS = 4000

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function isRecentlyDismissed(): boolean {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    return Boolean(dismissedAt) && Date.now() - dismissedAt < DISMISS_TTL_MS
  } catch {
    return false
  }
}

export function InstallPromptBanner() {
  const { t } = useTranslation()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandalone() || isRecentlyDismissed()) return

    const handler = (event: Event) => {
      // Stop the browser's mini-infobar so we control when the prompt appears.
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      // Brief delay so we don't pop the banner the instant the page loads.
      window.setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    }
    const installed = () => {
      setDeferredPrompt(null)
      setVisible(false)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  const persistDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // localStorage unavailable (private mode) — accept the loss.
    }
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    setVisible(false)
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'dismissed') persistDismiss()
    } finally {
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    persistDismiss()
    setVisible(false)
    setDeferredPrompt(null)
  }

  if (!visible || !deferredPrompt) return null

  return (
    <div
      role="dialog"
      aria-labelledby="pwa-install-banner-title"
      aria-describedby="pwa-install-banner-desc"
      className={cn(
        // Sit just above the mobile BottomNav; drop to the corner at md where
        // the BottomNav is hidden.
        'fixed inset-x-3 bottom-[var(--bottom-nav-space)] z-50 rounded-xl border bg-card/95 shadow-lg backdrop-blur md:bottom-3',
        'border-border p-4 flex gap-3 items-start sm:max-w-md sm:left-auto sm:right-3',
      )}
    >
      <div className="flex-1 min-w-0">
        <p id="pwa-install-banner-title" className="text-sm font-semibold text-foreground">
          {t('pwa.installBanner.title')}
        </p>
        <p id="pwa-install-banner-desc" className="mt-1 text-xs text-muted-foreground">
          {t('pwa.installBanner.description')}
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={handleInstall}>
            <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {t('pwa.installBanner.install')}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss}>
            {t('pwa.installBanner.later')}
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('pwa.installBanner.dismiss')}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
