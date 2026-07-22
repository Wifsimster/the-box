import { type KeyboardEvent, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import type { GeoMap } from '@the-box/types'
import { Shuffle } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useRovingTabindex } from '@/hooks/useRovingTabindex'
import { isPlaceholderImageUrl } from '@/lib/geo-image'
import { cn } from '@/lib/utils'

interface MapPickerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    maps: GeoMap[]
    selectedMapId: number | null
    onSelect: (mapId: number | null) => void
    // Extra "any map" pseudo-option at the top of the list for games with
    // multiple maps; selecting it tells the picker to let the server
    // randomize the map for the next round.
    showAnyMapOption?: boolean
}

/**
 * Free-play map chooser. Reuses the daily `GeoMapChooser` aesthetic
 * (thumbnail + region label) but lives inside a sheet/drawer instead of
 * inline so it doesn't compete with the immersive screenshot/map view.
 */
export function MapPicker({
    open,
    onOpenChange,
    maps,
    selectedMapId,
    onSelect,
    showAnyMapOption,
}: MapPickerProps) {
    const { t } = useTranslation()
    const isMobile = useIsMobile()

    // Total radio count includes the optional "any map" pseudo-option at
    // index 0. Initial focus lands on the currently-selected map (or the
    // "any" option / first map when none is selected) so Tab moves the
    // ring to a sensible spot.
    const itemCount = (showAnyMapOption ? 1 : 0) + maps.length
    const initialIndex = (() => {
        if (selectedMapId == null) return 0
        const i = maps.findIndex((m) => m.id === selectedMapId)
        if (i < 0) return 0
        return showAnyMapOption ? i + 1 : i
    })()
    const { getItemProps } = useRovingTabindex<HTMLButtonElement>({
        count: itemCount,
        initialIndex,
    })

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side={isMobile ? 'bottom' : 'right'}
                className={cn(
                    'p-0 flex flex-col gap-0',
                    isMobile ? 'h-[80dvh] rounded-t-2xl' : 'sm:max-w-md size-full',
                )}
            >
                <SheetHeader className="p-4 pb-2 text-left space-y-1">
                    <SheetTitle>{t('geo.play.pickMap', 'Pick a map')}</SheetTitle>
                    <SheetDescription>
                        {t(
                            'geo.play.pickMapHint',
                            'Pick the in-game map you want to guess on.',
                        )}
                    </SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
                    {maps.length === 0 ? (
                        <p className="py-12 text-center text-sm text-muted-foreground">
                            {t(
                                'geo.play.noMapsYet',
                                'No maps are available for this game yet.',
                            )}
                        </p>
                    ) : (
                        <ul
                            role="radiogroup"
                            aria-label={t('geo.play.pickMap', 'Pick a map')}
                            className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3"
                        >
                            {showAnyMapOption && (
                                <li>
                                    <AnyMapCard
                                        {...getItemProps(0)}
                                        selected={selectedMapId == null}
                                        onSelect={() => {
                                            onSelect(null)
                                            onOpenChange(false)
                                        }}
                                    />
                                </li>
                            )}
                            {maps.map((m, i) => {
                                const index = showAnyMapOption ? i + 1 : i
                                return (
                                    <li key={m.id}>
                                        <MapCard
                                            {...getItemProps(index)}
                                            map={m}
                                            selected={selectedMapId === m.id}
                                            onSelect={() => {
                                                onSelect(m.id)
                                                onOpenChange(false)
                                            }}
                                        />
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}

interface AnyMapCardProps {
    selected: boolean
    tabIndex: number
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
    onSelect: () => void
    ref?: Ref<HTMLButtonElement>
}

function AnyMapCard({ selected, tabIndex, onKeyDown, onSelect, ref }: AnyMapCardProps) {
    const { t } = useTranslation()
    return (
        <button
            ref={ref}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={tabIndex}
            onKeyDown={onKeyDown}
            onClick={onSelect}
            className={cn(
                'group relative aspect-square w-full overflow-hidden rounded-lg border text-left transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink',
                selected
                    ? 'border-neon-pink ring-2 ring-neon-pink/60'
                    : 'border-dashed border-muted-foreground/40 hover:border-neon-pink/60',
            )}
        >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-2">
                <Shuffle className="size-5 text-neon-pink" aria-hidden />
                <span className="text-xs font-medium">
                    {t('geo.play.anyMap', 'Surprise me')}
                </span>
            </div>
        </button>
    )
}

interface MapCardProps {
    map: GeoMap
    selected: boolean
    tabIndex: number
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
    onSelect: () => void
    ref?: Ref<HTMLButtonElement>
}

function MapCard({ map, selected, tabIndex, onKeyDown, onSelect, ref }: MapCardProps) {
    const { t } = useTranslation()
    const label = map.region ?? t('geo.daily.chooseMap.worldFallback', 'World map')
    const placeholder = isPlaceholderImageUrl(map.imageUrl)
    return (
        <button
            ref={ref}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            tabIndex={tabIndex}
            onKeyDown={onKeyDown}
            onClick={onSelect}
            className={cn(
                'group relative aspect-square w-full overflow-hidden rounded-lg border bg-muted/30 text-left transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink',
                selected
                    ? 'border-neon-pink ring-2 ring-neon-pink/60 shadow-[var(--glow-pink-sm)]'
                    : 'border-muted/40 hover:border-neon-pink/60',
            )}
        >
            {!placeholder ? (
                <img
                    src={map.imageUrl}
                    alt=""
                    className="size-full object-cover transition group-hover:scale-[1.02]"
                    loading="lazy"
                    decoding="async"
                />
            ) : (
                <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    {label}
                </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                <span className="block truncate text-xs font-medium text-white">
                    {label}
                </span>
            </div>
        </button>
    )
}
