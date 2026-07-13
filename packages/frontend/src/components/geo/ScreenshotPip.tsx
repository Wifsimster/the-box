import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, Maximize2, Minimize2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScreenshotPipProps {
    imageUrl: string
    alt: string
    className?: string
}

/**
 * Picture-in-picture reference card for the capture being located. Floats
 * over the map (anchored to the top-right of the nearest relative ancestor)
 * so the player can keep the screenshot in view while dropping a pin: tap
 * the image to enlarge / shrink it, or dismiss it behind a recoverable
 * "show capture" pill when it gets in the way of the pin spot.
 */
export function ScreenshotPip({ imageUrl, alt, className }: ScreenshotPipProps) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)
    const [hidden, setHidden] = useState(false)

    if (hidden) {
        return (
            <button
                type="button"
                onClick={() => setHidden(false)}
                className={cn(
                    'absolute right-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink',
                    className,
                )}
            >
                <ImageIcon className="size-3.5" aria-hidden />
                {t('geo.pip.show', 'Show the capture')}
            </button>
        )
    }

    const toggleLabel = expanded
        ? t('geo.pip.shrink', 'Shrink the capture')
        : t('geo.pip.expand', 'Enlarge the capture')

    return (
        <div
            className={cn(
                'absolute right-2 top-2 z-20 overflow-hidden rounded-lg border border-white/20 bg-black/70 shadow-lg backdrop-blur transition-[width] duration-200 motion-reduce:transition-none',
                expanded ? 'w-[min(80%,26rem)]' : 'w-28 sm:w-40',
                className,
            )}
        >
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
                aria-label={toggleLabel}
                title={toggleLabel}
                className={cn(
                    'block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neon-pink',
                    expanded ? 'cursor-zoom-out' : 'cursor-zoom-in',
                )}
            >
                <img
                    src={imageUrl}
                    alt={alt}
                    className="block w-full object-contain"
                    draggable={false}
                />
                {/* Affordance hint — decorative, the button above carries the
                    accessible name. */}
                <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-1 right-1 inline-flex size-6 items-center justify-center rounded-full bg-black/55 text-white"
                >
                    {expanded ? (
                        <Minimize2 className="size-3.5" />
                    ) : (
                        <Maximize2 className="size-3.5" />
                    )}
                </span>
            </button>
            <button
                type="button"
                onClick={() => {
                    setHidden(true)
                    setExpanded(false)
                }}
                aria-label={t('geo.pip.hide', 'Hide the capture')}
                title={t('geo.pip.hide', 'Hide the capture')}
                className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
            >
                <X className="size-3.5" aria-hidden />
            </button>
        </div>
    )
}
