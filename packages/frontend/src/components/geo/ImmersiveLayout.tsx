import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImmersiveLayoutProps {
    screenshot: ReactNode
    map: ReactNode
    // Top-right overlay (the fullscreen toggle, plus optional report button).
    topRight?: ReactNode
    // Top header strip rendered above the deck. Used for context
    // metadata that isn't itself an action — game/map labels, alpha
    // banner, etc. Sized by its own intrinsic height so passing null
    // collapses cleanly.
    topBar?: ReactNode
    // Sticky bottom dock (skip / submit / next).
    bottomDock?: ReactNode
    // Result panel rendered as a non-blocking overlay above the dock.
    resultOverlay?: ReactNode
    // True when the page should pin itself to the viewport (CSS immersive
    // fallback for browsers without native fullscreen).
    isImmersive: boolean
    // True when a modal sheet (game/map picker) is open. We mark the map
    // panel as `inert` so Leaflet's pan/zoom and keyboard controls cannot
    // steal events from the panel above it.
    mapInert?: boolean
    // Kept for API compatibility with consumers that pass it; the layout
    // no longer needs to reset any internal state per round.
    roundKey?: number | string
}

/**
 * Split-panel layout for the screenshot + map flow. Both panels are
 * always visible — stacked vertically on mobile, side-by-side on desktop —
 * and each carries a corner type-tag badge so the player can tell them
 * apart at a glance without a Photo/Map toggle.
 */
export function ImmersiveLayout({
    screenshot,
    map,
    topRight,
    topBar,
    bottomDock,
    resultOverlay,
    isImmersive,
    mapInert = false,
}: ImmersiveLayoutProps) {
    const { t } = useTranslation()

    return (
        <div
            className={cn(
                'relative flex flex-col bg-black text-foreground',
                isImmersive
                    ? 'fixed inset-0 z-50 h-[100dvh]'
                    : 'min-h-[100svh] h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)]',
            )}
            data-immersive={isImmersive ? 'true' : 'false'}
        >
            {/* Top-right overlay (fullscreen toggle, etc.) */}
            {topRight && (
                <div
                    className="absolute right-3 top-3 z-30 flex items-center gap-2"
                    style={{
                        paddingTop: 'env(safe-area-inset-top, 0px)',
                        paddingRight: 'env(safe-area-inset-right, 0px)',
                    }}
                >
                    {topRight}
                </div>
            )}

            {/* Top context bar — game/map labels and any informational
                copy. Sits above the deck so the dock can stay focused on
                actions. Collapses to nothing when no children are passed. */}
            {topBar && (
                <div
                    className="z-30 border-b border-white/10 bg-black/70 backdrop-blur"
                    style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
                >
                    <div className="px-3 py-2 pr-16">{topBar}</div>
                </div>
            )}

            {/* Deck — both panels are always visible. On mobile the map gets
                visual priority (the user's active surface) with the photo
                kept reference-sized above; on tablet/desktop they go
                side-by-side at equal width. */}
            <div className="flex-1 relative overflow-hidden">
                <div className="absolute inset-0 grid grid-rows-[minmax(38%,1fr)_minmax(45%,1.2fr)] md:grid-rows-1 md:grid-cols-2">
                    <Panel
                        id="geo-panel-photo"
                        tag={
                            <>
                                <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                                <span>
                                    {t('geo.play.tabs.screenshot', 'Photo')}
                                </span>
                            </>
                        }
                        className="border-b border-white/10 md:border-b-0 md:border-r"
                    >
                        {screenshot}
                    </Panel>
                    <Panel
                        id="geo-panel-map"
                        inert={mapInert}
                        tag={
                            <>
                                <MapPin className="h-3.5 w-3.5" aria-hidden />
                                <span>{t('geo.play.tabs.map', 'Map')}</span>
                            </>
                        }
                    >
                        {map}
                    </Panel>
                </div>
            </div>

            {/* Result overlay — sits above the deck but below the dock so
                the dock's Next button is always reachable. The bottom
                offset clears the redesigned two-row dock (secondary
                actions + primary CTA). */}
            {resultOverlay && (
                <div
                    className="absolute left-0 right-0 z-30 px-3"
                    style={{
                        bottom:
                            'calc(env(safe-area-inset-bottom, 0px) + 7.5rem)',
                    }}
                >
                    {resultOverlay}
                </div>
            )}

            {/* Bottom dock — always reachable by the right thumb. Adds the
                iOS safe-area inset so the home indicator doesn't collide
                with the primary action. */}
            {bottomDock && (
                <div
                    className="z-40 border-t border-white/10 bg-black/70 backdrop-blur"
                    style={{
                        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                    }}
                >
                    <div className="px-3 py-3">{bottomDock}</div>
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
}: {
    id: string
    tag: ReactNode
    className?: string
    children: ReactNode
    inert?: boolean
}) {
    return (
        <div
            id={id}
            className={cn(
                'relative h-full w-full overflow-hidden',
                className,
            )}
            inert={inertProp || undefined}
        >
            {children}
            <div className="pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white shadow backdrop-blur">
                {tag}
            </div>
        </div>
    )
}
