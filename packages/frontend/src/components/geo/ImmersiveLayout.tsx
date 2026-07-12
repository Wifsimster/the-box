import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImmersiveLayoutProps {
    screenshot: ReactNode
    map: ReactNode
    // Right-aligned header actions (home link, fullscreen toggle).
    // Rendered inside the same header strip as `topBar` so the page has
    // a single top row instead of an absolute overlay racing the bar
    // for z-order.
    topRight?: ReactNode
    // Left side of the header strip. Used for context metadata —
    // game/map chips etc. Sized by its own intrinsic height so passing
    // null collapses cleanly.
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
 * always visible — stacked vertically on mobile (map dominant),
 * side-by-side on desktop, where each carries a corner type-tag badge
 * so the player can tell them apart at a glance.
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
            {/* Single header strip — context chips on the left, home /
                fullscreen actions on the right. One row, one z-index:
                replaces the old absolute top-right overlay that needed a
                z-40 bump to stay clickable over the bar's backdrop-filter. */}
            {(topBar || topRight) && (
                <div
                    className="z-30 border-b border-white/10 bg-black/70 backdrop-blur"
                    style={{
                        paddingTop: 'env(safe-area-inset-top, 0px)',
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

            {/* Deck — both panels are always visible. On mobile the map gets
                visual priority (the user's active surface) with the photo
                kept reference-sized above; on tablet/desktop they go
                side-by-side at equal width. Row split favors the map hard:
                the dock is now a single row, and the reclaimed space
                belongs to the surface the player acts on. */}
            <div className="flex-1 relative overflow-hidden">
                <div className="absolute inset-0 grid grid-rows-[minmax(30%,1fr)_minmax(52%,1.6fr)] md:grid-rows-1 md:grid-cols-2">
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
                    >
                        {map}
                    </Panel>
                </div>
            </div>

            {/* Result overlay — sits above the deck but below the dock so
                the dock's Next button is always reachable. The bottom
                offset clears the single-row dock (padding + one 3rem row). */}
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
                'relative size-full overflow-hidden',
                className,
            )}
            inert={inertProp || undefined}
        >
            {children}
            {/* Type-tag badge — desktop only. On mobile the panels are
                self-evident (a screenshot vs a map with zoom controls)
                and every overlay pill costs scarce panel real estate. */}
            <div className="pointer-events-none absolute left-3 top-3 z-20 hidden items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white shadow backdrop-blur md:inline-flex">
                {tag}
            </div>
        </div>
    )
}
