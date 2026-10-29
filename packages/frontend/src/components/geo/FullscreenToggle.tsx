import { useTranslation } from 'react-i18next'
import { Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FullscreenToggleProps {
  isImmersive: boolean
  onToggle: () => void
  isNativeSupported: boolean
  className?: string
}

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
