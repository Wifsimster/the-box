import { useTranslation } from 'react-i18next'
import { Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FullscreenToggleProps {
  isImmersive: boolean
  onToggle: () => void
  // Native fullscreen support. When false the button still works (CSS
  // fallback) but we badge it differently so users on iOS know they're
  // getting an "immersive" view rather than the OS-level chrome-hiding.
  isNativeSupported: boolean
  className?: string
}

/**
 * Glass FAB-style toggle for entering/leaving the immersive view. Sits in
 * the top-right of the active surface; auto-sizes to a 44 × 44 hit area
 * (matches Apple HIG so a fingertip can land cleanly even on a 6.7" phone
 * held one-handed).
 */
export function FullscreenToggle({
  isImmersive,
  onToggle,
  isNativeSupported,
  className,
}: FullscreenToggleProps) {
  const { t } = useTranslation()
  const label = isImmersive
    ? t('geo.fullscreen.exit', 'Exit immersive view')
    : isNativeSupported
      ? t('geo.fullscreen.enter', 'Enter fullscreen')
      : t('geo.fullscreen.enterImmersive', 'Enter immersive view')
  const Icon = isImmersive ? Minimize2 : Maximize2
  return (
    <Button
      type="button"
      onClick={onToggle}
      aria-pressed={isImmersive}
      aria-label={label}
      title={label}
      // Glassy chip on top of the screenshot/map. `backdrop-blur` keeps it
      // legible across busy backgrounds without a hard scrim.
      className={cn(
        'size-11 p-0 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur',
        'border border-white/10 text-white shadow-lg',
        'focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
    </Button>
  )
}
