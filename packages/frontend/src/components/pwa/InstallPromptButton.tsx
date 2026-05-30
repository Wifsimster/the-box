import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

const DISMISS_KEY = 'pwa:install-dismissed-at'
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 30

interface InstallPromptButtonProps {
  variant?: 'desktop' | 'mobile'
  onInstalled?: () => void
}

export function InstallPromptButton({ variant = 'desktop', onInstalled }: InstallPromptButtonProps) {
  const { t } = useTranslation()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return

    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    const installed = () => {
      setDeferredPrompt(null)
      onInstalled?.()
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [onInstalled])

  if (!deferredPrompt) return null

  const promptInstall = async () => {
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'dismissed') {
        localStorage.setItem(DISMISS_KEY, String(Date.now()))
      }
    } finally {
      setDeferredPrompt(null)
    }
  }

  const isMobile = variant === 'mobile'

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={promptInstall}
      className={cn(isMobile && 'w-full justify-start')}
      aria-label={t('pwa.install')}
    >
      <Download className={cn('size-4', isMobile ? 'mr-2' : 'mr-1')} />
      {t('pwa.install')}
    </Button>
  )
}
