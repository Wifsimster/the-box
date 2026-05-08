import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export function OfflineIndicator() {
  const { t } = useTranslation()
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium',
        'bg-warning/15 text-warning border-b border-warning/40 backdrop-blur-md',
      )}
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      <span>{t('pwa.offlineBanner')}</span>
    </div>
  )
}
