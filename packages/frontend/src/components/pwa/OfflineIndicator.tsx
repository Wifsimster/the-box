import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'
import { useOnline } from '@/hooks/useOnline'
import { cn } from '@/lib/utils'

export function OfflineIndicator() {
  const { t } = useTranslation()
  const isOnline = useOnline()

  if (isOnline) return null

  return (
    <output
      aria-live="polite"
      className={cn(
        // This banner sits above the Header (z-60) pinned to top-0, so it has
        // to pad for the iOS notch itself — otherwise the text renders under
        // the status bar / notch on a notched iPhone.
        'fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 px-4 py-2 pt-[max(env(safe-area-inset-top),0.5rem)] text-xs sm:text-sm font-medium',
        'bg-warning/15 text-warning border-b border-warning/40 backdrop-blur-md',
      )}
    >
      <WifiOff className="size-4" aria-hidden="true" />
      <span>{t('pwa.offlineBanner')}</span>
    </output>
  )
}
