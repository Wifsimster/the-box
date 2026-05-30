import { useTranslation } from 'react-i18next'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'

// Shared "map unavailable" tile used by both MapCanvas (CSS background-image)
// and MapCanvasLeaflet (ImageOverlay). Both surfaces hit the same
// placeholder-URL guard + onError probe; this component keeps the visual
// language and a11y attributes consistent.
export function MapErrorFallback({
    aspectRatio,
    className,
}: {
    aspectRatio: string
    className?: string
}) {
    const { t } = useTranslation()
    const label = t('geo.daily.mapUnavailable', 'Map unavailable')
    return (
        <div
            style={{ aspectRatio }}
            className={cn(
                'relative w-full rounded-lg border border-dashed bg-muted/30 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground',
                className,
            )}
            role="img"
            aria-label={label}
        >
            <ImageOff className="size-6 opacity-60" aria-hidden />
            <span>{label}</span>
        </div>
    )
}
