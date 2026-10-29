import { useState, type CSSProperties, type FocusEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, MapPin, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImmersiveLayoutProps {
    screenshot: ReactNode
    map: ReactNode
    hero?: ReactNode
    topRight?: ReactNode
    topBar?: ReactNode
    bottomDock?: ReactNode
    resultOverlay?: ReactNode
    isImmersive: boolean
    mapInert?: boolean
    roundKey?: number | string
}

export function ImmersiveLayout({
    screenshot,
    map,
    hero,
    topRight,
    topBar,
    bottomDock,
    resultOverlay,
    isImmersive,
    mapInert = false,
}: ImmersiveLayoutProps) {
    const { t } = useTranslation()

    const [mapHovered, setMapHovered] = useState(false)
    const [mapPinned, setMapPinned] = useState(false)
    const mapExpanded = mapPinned || mapHovered
    const [photoFocused, setPhotoFocused] = useState(false)
    const deckStyle = {
        '--geo-desktop-cols': mapExpanded ? '35fr 65fr' : '60fr 40fr',
        '--geo-mobile-rows': photoFocused
            ? 'minmax(52%,1.6fr) minmax(30%,1fr)'
            : 'minmax(30%,1fr) minmax(52%,1.6fr)',
    } as CSSProperties
    const photoToggleLabel = photoFocused
        ? t('geo.pip.shrink', 'Shrink the capture')
        : t('geo.pip.expand', 'Enlarge the capture')

    return (
        <div
            className={cn(
                'relative flex flex-col bg-black text-foreground',
                isImmersive
                    ? 'fixed inset-0 z-50 h-[100dvh]'
                    : 'h-[var(--page-h)]',
            )}
            data-immersive={isImmersive ? 'true' : 'false'}
        >
            {(topBar || topRight) && (
                <div
                    className="z-30 border-b border-white/10 bg-black/70 backdrop-blur"
                    style={{
                        paddingTop: isImmersive ? 'env(safe-area-inset-top, 0px)' : undefined,
                        paddingLeft: 'env(safe-area-inset-left, 0px)',
                        paddingRight: 'env(safe-area-inset-right, 0px)',
                    }}
                >
                    <div className="flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">{topBar}</div>
                        {topRight && (
                            <div className="flex shrink-0 items-center gap-2">
                                {topRight}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="flex-1 relative overflow-hidden">
                {hero ? (
                    <div className="absolute inset-0">{hero}</div>
                ) : (
                <div
                    className="absolute inset-0 grid grid-rows-(--geo-mobile-rows) transition-[grid-template-rows] duration-300 motion-reduce:transition-none md:grid-rows-1 md:[grid-template-columns:var(--geo-desktop-cols)] md:transition-[grid-template-columns] motion-reduce:md:transition-none"
                    style={deckStyle}
                >
                    <Panel
                        id="geo-panel-photo"
                        tag={
                            <>
                                <ImageIcon className="size-3.5" aria-hidden />
                                <span>
                                    {t('geo.play.tabs.screenshot', 'Photo')}
                                </span>
                            </>
                        }
                        className="border-b border-white/10 md:border-b-0 md:border-r"
                        cornerAction={
                            <button
                                type="button"
                                onClick={() => setPhotoFocused((p) => !p)}
                                aria-pressed={photoFocused}
                                aria-controls="geo-panel-photo"
                                aria-label={photoToggleLabel}
                                className="pointer-events-auto absolute bottom-2 right-2 z-20 inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white shadow-lg backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink md:hidden"
                            >
                                {photoFocused ? (
                                    <Minimize2 className="size-5" aria-hidden />
                                ) : (
                                    <Maximize2 className="size-5" aria-hidden />
                                )}
                            </button>
                        }
                    >
                        {screenshot}
                    </Panel>
                    <Panel
                        id="geo-panel-map"
                        inert={mapInert}
                        tag={
                            <>
                                <MapPin className="size-3.5" aria-hidden />
                                <span>{t('geo.play.tabs.map', 'Map')}</span>
                            </>
                        }
                        onMouseEnter={() => setMapHovered(true)}
                        onMouseLeave={() => setMapHovered(false)}
                        onFocusCapture={() => setMapHovered(true)}
                        onBlurCapture={(e) => {
                            if (
                                !e.currentTarget.contains(
                                    e.relatedTarget as Node | null,
                                )
                            ) {
                                setMapHovered(false)
                            }
                        }}
                        cornerAction={
                            <button
                                type="button"
                                onClick={() => setMapPinned((p) => !p)}
                                aria-pressed={mapPinned}
                                aria-label={t(
                                    'geo.play.expandMap',
                                    'Keep the map enlarged',
                                )}
                                title={t(
                                    'geo.play.expandMap',
                                    'Keep the map enlarged',
                                )}
                                className="pointer-events-auto absolute right-3 top-3 z-20 hidden size-9 items-center justify-center rounded-full bg-black/55 text-white shadow backdrop-blur hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink md:inline-flex"
                            >
                                {mapPinned ? (
                                    <Minimize2 className="size-4" aria-hidden />
                                ) : (
                                    <Maximize2 className="size-4" aria-hidden />
                                )}
                            </button>
                        }
                    >
                        {map}
                    </Panel>
                </div>
                )}
            </div>

            {resultOverlay && (
                <div
                    className="absolute left-0 right-0 z-30 px-3"
                    style={{
                        bottom:
                            'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
                    }}
                >
                    {resultOverlay}
                </div>
            )}

            {bottomDock && (
                <div
                    className="z-40 border-t border-white/10 bg-black/70 backdrop-blur"
                    style={{
                        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                    }}
                >
                    <div className="p-3">{bottomDock}</div>
                </div>
            )}
        </div>
    )
}

function Panel({
    id,
    tag,
    className,
    children,
    inert: inertProp,
    cornerAction,
    ...handlers
}: {
    id: string
    tag: ReactNode
    className?: string
    children: ReactNode
    inert?: boolean
    cornerAction?: ReactNode
    onMouseEnter?: () => void
    onMouseLeave?: () => void
    onFocusCapture?: () => void
    onBlurCapture?: (e: FocusEvent<HTMLDivElement>) => void
}) {
    return (
        <div
            id={id}
            className={cn(
                'relative size-full overflow-hidden',
                className,
            )}
            inert={inertProp || undefined}
            {...handlers}
        >
            {children}
            <div className="pointer-events-none absolute left-3 top-3 z-20 hidden items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white shadow backdrop-blur md:inline-flex">
                {tag}
            </div>
            {cornerAction}
        </div>
    )
}
