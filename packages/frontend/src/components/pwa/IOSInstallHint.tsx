import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'pwa:ios-hint-dismissed-at'
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 30
const SHOW_DELAY_MS = 3000

function shouldShowHint(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && 'ontouchend' in document)
  if (!isIOS) return false

  // Only Safari on iOS can install a PWA; Chrome/Firefox-on-iOS just bookmark.
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  if (!isSafari) return false

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  if (isStandalone) return false

  const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
  if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return false

  return true
}

export function IOSInstallHint() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!shouldShowHint()) return
    const id = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [])

  if (!visible) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // localStorage unavailable (private mode) — accept the loss; user can dismiss again next visit.
    }
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-labelledby="ios-install-title"
      className={cn(
        'fixed inset-x-3 bottom-3 z-50 rounded-xl border bg-card/95 shadow-lg backdrop-blur',
        'border-border p-4 flex gap-3 items-start',
      )}
    >
      <div className="flex-1 min-w-0">
        <p id="ios-install-title" className="text-sm font-semibold text-foreground">
          {t('pwa.iosInstall.title')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
          {t('pwa.iosInstall.tap')}{' '}
          <Share className="h-3.5 w-3.5 text-primary inline-block" aria-hidden="true" />{' '}
          {t('pwa.iosInstall.then')}{' '}
          <Plus className="h-3.5 w-3.5 text-primary inline-block" aria-hidden="true" />{' '}
          {t('pwa.iosInstall.addToHome')}
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('pwa.iosInstall.dismiss')}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
