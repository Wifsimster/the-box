import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useBottomPromptSlotFree } from './prompt-timing'

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

  try {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return false
  } catch {
    // storage blocked — show the hint; dismissal just won't persist
  }

  return true
}

export function IOSInstallHint() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const slotFree = useBottomPromptSlotFree()

  useEffect(() => {
    if (!shouldShowHint()) return
    const id = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [])

  if (!visible || !slotFree) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // localStorage unavailable (private mode) — accept the loss; user can dismiss again next visit.
    }
    setVisible(false)
  }

  return (
    <dialog
      open
      aria-labelledby="ios-install-title"
      className={cn(
        // Sit just above the mobile BottomNav (matching the other PWA banners);
        // drop to the corner at md where the BottomNav is hidden. A bare
        // bottom-3 anchored the hint on top of the fixed bottom nav.
        'fixed inset-x-3 top-auto bottom-[var(--bottom-nav-space)] z-50 m-0 w-auto max-h-none max-w-none rounded-xl border bg-card/95 shadow-lg backdrop-blur md:bottom-3',
        'border-border py-3 pl-4 pr-1 flex gap-2 items-start sm:max-w-md sm:left-auto sm:right-3',
        'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4',
      )}
    >
      <div className="flex-1 min-w-0 pt-1">
        <p id="ios-install-title" className="text-sm font-semibold text-foreground">
          {t('pwa.iosInstall.title')}
        </p>
        <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
          {t('pwa.iosInstall.tap')}{' '}
          <Share className="size-3.5 text-primary inline-block" aria-hidden="true" />{' '}
          {t('pwa.iosInstall.then')}{' '}
          <Plus className="size-3.5 text-primary inline-block" aria-hidden="true" />{' '}
          {t('pwa.iosInstall.addToHome')}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={dismiss}
        aria-label={t('pwa.iosInstall.dismiss')}
        className="shrink-0 text-muted-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </dialog>
  )
}
