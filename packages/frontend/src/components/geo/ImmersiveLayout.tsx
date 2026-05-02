import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useIsMobile'

type Tab = 'photo' | 'map'

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
    // Reset the active tab to "photo" — handy when the round changes so
    // the player always lands on the screenshot for the new shot.
    roundKey: number | string
}

/**
 * Mobile-first split-panel for the screenshot ↔ map flow. Defaults to a
 * **toggle** (one panel at a time, swap via tabs or horizontal swipe) on
 * mobile and a **side-by-side** view on desktop.
 *
 * The swipe gesture is enhancement-only — keyboard / SR users get the
 * tab buttons as a first-class non-gesture path. Swiping is ignored when
 * the user prefers reduced motion (handled by the consumer's transition
 * styles).
 */
export function ImmersiveLayout({
    screenshot,
    map,
    topRight,
    bottomDock,
    resultOverlay,
    isImmersive,
    roundKey,
}: ImmersiveLayoutProps) {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    const [tab, setTab] = useState<Tab>('photo')

    // Snap back to "photo" whenever a new round starts. Players want to
    // see the new screenshot first; if they were on the map mid-pin they
    // can swipe back.
    useEffect(() => {
        setTab('photo')
    }, [roundKey])

    // Touch-driven swipe to toggle Photo ↔ Map on mobile only. Desktop
    // shows both surfaces, so swipe is a no-op there.
    const touchStartXRef = useRef<number | null>(null)
    const touchStartYRef = useRef<number | null>(null)
    const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        const touch = e.touches.item(0)
        if (!touch) return
        touchStartXRef.current = touch.clientX
        touchStartYRef.current = touch.clientY
    }
    const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!isMobile) return
        const startX = touchStartXRef.current
        const startY = touchStartYRef.current
        touchStartXRef.current = null
        touchStartYRef.current = null
        if (startX == null || startY == null) return
        const touch = e.changedTouches.item(0)
        if (!touch) return
        const dx = touch.clientX - startX
        const dy = touch.clientY - startY
        // Tight threshold so a casual finger drift doesn't flip the tab,
        // and a strong vertical bias (|dy| > |dx|) cancels — players will
        // be tapping pins, scrolling result sheets, etc.
        if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return
        if (dx < 0 && tab === 'photo') setTab('map')
        else if (dx > 0 && tab === 'map') setTab('photo')
    }

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
            {/* Tab bar — mobile only. On desktop both panels show side-by-side
                and the tablist is a no-op (we still render it, hidden, so
                screen-reader users on resized viewports keep the same
                navigation contract). */}
            <div
                role="tablist"
                aria-label={t('geo.play.deck.label', 'Screenshot and map')}
                className={cn(
                    'absolute left-1/2 top-3 -translate-x-1/2 z-30 flex gap-1 rounded-full bg-black/50 p-1 backdrop-blur md:hidden',
                )}
            >
                <TabButton
                    id="geo-tab-photo"
                    controls="geo-panel-photo"
                    active={tab === 'photo'}
                    onClick={() => setTab('photo')}
                >
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                    <span className="text-xs font-medium">
                        {t('geo.play.tabs.screenshot', 'Photo')}
                    </span>
                </TabButton>
                <TabButton
                    id="geo-tab-map"
                    controls="geo-panel-map"
                    active={tab === 'map'}
                    onClick={() => setTab('map')}
                >
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    <span className="text-xs font-medium">
                        {t('geo.play.tabs.map', 'Map')}
                    </span>
                </TabButton>
            </div>

            {/* Top-right overlay (fullscreen toggle, etc.) */}
            {topRight && (
                <div
                    className="absolute right-3 top-3 z-30 flex items-center gap-2"
                    style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
                >
                    {topRight}
                </div>
            )}

            {/* Deck */}
            <div
                className="flex-1 relative overflow-hidden"
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
            >
                <div className="absolute inset-0 grid md:grid-cols-2">
                    <Panel
                        id="geo-panel-photo"
                        labelledBy="geo-tab-photo"
                        active={tab === 'photo'}
                        className="md:!opacity-100 md:!pointer-events-auto"
                    >
                        {screenshot}
                    </Panel>
                    <Panel
                        id="geo-panel-map"
                        labelledBy="geo-tab-map"
                        active={tab === 'map'}
                        className="md:!opacity-100 md:!pointer-events-auto"
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

function TabButton({
    id,
    controls,
    active,
    onClick,
    children,
}: {
    id: string
    controls: string
    active: boolean
    onClick: () => void
    children: ReactNode
}) {
    return (
        <button
            id={id}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={controls}
            tabIndex={active ? 0 : -1}
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink',
                active
                    ? 'bg-white text-black shadow'
                    : 'text-white/80 hover:text-white',
            )}
        >
            {children}
        </button>
    )
}

function Panel({
    id,
    active,
    labelledBy,
    className,
    children,
}: {
    id: string
    active: boolean
    labelledBy: string
    className?: string
    children: ReactNode
}) {
    return (
        <div
            id={id}
            role="tabpanel"
            aria-labelledby={labelledBy}
            className={cn(
                'relative h-full w-full overflow-hidden transition-opacity duration-200',
                active ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
                'motion-reduce:transition-none',
                className,
            )}
        >
            {children}
        </div>
    )
}
