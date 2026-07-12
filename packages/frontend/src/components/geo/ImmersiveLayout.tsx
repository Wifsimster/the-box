import { useState, type CSSProperties, type FocusEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, MapPin, Maximize2, Minimize2 } from 'lucide-react'
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

    // Desktop focus-expand: the split is photo-dominant (60/40) while
    // studying the screenshot and flips map-dominant when the pointer or
    // keyboard focus is on the map — the active surface gets the space.
    // The pin toggle locks the expansion for players who want the map
    // large full-time. Hover state is pointer-only by construction
    // (mouseenter never fires on touch), so mobile is untouched.
    const [mapHovered, setMapHovered] = useState(false)
    const [mapPinned, setMapPinned] = useState(false)
    const mapExpanded = mapPinned || mapHovered
    const deckStyle = {
        '--geo-desktop-cols': mapExpanded ? '35fr 65fr' : '60fr 40fr',
    } as CSSProperties

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
                kept reference-sized above; the dock is a single row, so the
                reclaimed space belongs to the surface the player acts on.
                On desktop the split is photo-dominant and expands toward
                the map on hover / pin (see mapExpanded above); the
                grid-template-columns transition interpolates in Chromium /
                Firefox and snaps elsewhere, which is an acceptable
                fallback. */}
            <div className="flex-1 relative overflow-hidden">
                <div
                    className="absolute inset-0 grid grid-rows-[minmax(30%,1fr)_minmax(52%,1.6fr)] md:grid-rows-1 md:[grid-template-columns:var(--geo-desktop-cols)] md:transition-[grid-template-columns] md:duration-300 motion-reduce:md:transition-none"
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
                            // Only collapse when focus actually left the
                            // panel (blur fires on every inner move too).
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
    cornerAction,
    ...handlers
}: {
    id: string
    tag: ReactNode
    className?: string
    children: ReactNode
    inert?: boolean
    // Optional interactive control anchored in the panel's top-right
    // corner (e.g. the desktop map-expand pin toggle).
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
            {/* Type-tag badge — desktop only. On mobile the panels are
                self-evident (a screenshot vs a map with zoom controls)
                and every overlay pill costs scarce panel real estate. */}
            <div className="pointer-events-none absolute left-3 top-3 z-20 hidden items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white shadow backdrop-blur md:inline-flex">
                {tag}
            </div>
            {cornerAction}
        </div>
    )
}
