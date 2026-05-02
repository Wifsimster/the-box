import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImmersiveLayoutProps {
    screenshot: ReactNode
    map: ReactNode
    // Top-right overlay (the fullscreen toggle, plus optional report button).
    topRight?: ReactNode
    // Sticky bottom dock (skip / submit / next).
    bottomDock?: ReactNode
    // Result panel rendered as a non-blocking overlay above the dock.
    resultOverlay?: ReactNode
    // True when the page should pin itself to the viewport (CSS immersive
    // fallback for browsers without native fullscreen).
    isImmersive: boolean
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
    bottomDock,
    resultOverlay,
    isImmersive,
}: ImmersiveLayoutProps) {
    const { t } = useTranslation()

    return (
        <div
            className={cn(
                'relative flex flex-col bg-black text-foreground',
                isImmersive
                    ? 'fixed inset-0 z-50 h-[100dvh]'
                    : 'h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)]',
            )}
            data-immersive={isImmersive ? 'true' : 'false'}
        >
            {/* Top-right overlay (fullscreen toggle, etc.) */}
            {topRight && (
                <div
                    className="absolute right-3 top-3 z-30 flex items-center gap-2"
                    style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
                >
                    {topRight}
                </div>
            )}

            {/* Deck — both panels are always visible. Stacked rows on mobile,
                two columns on desktop. */}
            <div className="flex-1 relative overflow-hidden">
                <div className="absolute inset-0 grid grid-rows-2 md:grid-rows-1 md:grid-cols-2">
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
                the dock's Next button is always reachable. */}
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
}: {
    id: string
    tag: ReactNode
    className?: string
    children: ReactNode
}) {
    return (
        <div
            id={id}
            className={cn(
                'relative h-full w-full overflow-hidden',
                className,
            )}
        >
            {children}
            <div className="pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white shadow backdrop-blur">
                {tag}
            </div>
        </div>
    )
}
