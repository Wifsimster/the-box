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
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side={isMobile ? 'bottom' : 'right'}
                className={cn(
                    'p-0 flex flex-col gap-0',
                    isMobile ? 'h-[80dvh] rounded-t-2xl' : 'sm:max-w-md w-full h-full',
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
                                        selected={selectedMapId == null}
                                        onSelect={() => {
                                            onSelect(null)
                                            onOpenChange(false)
                                        }}
                                    />
                                </li>
                            )}
                            {maps.map((m) => (
                                <li key={m.id}>
                                    <MapCard
                                        map={m}
                                        selected={selectedMapId === m.id}
                                        onSelect={() => {
                                            onSelect(m.id)
                                            onOpenChange(false)
                                        }}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}

function AnyMapCard({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
    const { t } = useTranslation()
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
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
                <Shuffle className="h-5 w-5 text-neon-pink" aria-hidden />
                <span className="text-xs font-medium">
                    {t('geo.play.anyMap', 'Surprise me')}
                </span>
            </div>
        </button>
    )
}

function MapCard({
    map,
    selected,
    onSelect,
}: {
    map: GeoMap
    selected: boolean
    onSelect: () => void
}) {
    const { t } = useTranslation()
    const label = map.region ?? t('geo.daily.chooseMap.worldFallback', 'World map')
    const placeholder = isPlaceholderImageUrl(map.imageUrl)
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            onClick={onSelect}
            className={cn(
                'group relative aspect-square w-full overflow-hidden rounded-lg border bg-muted/30 text-left transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink',
                selected
                    ? 'border-neon-pink ring-2 ring-neon-pink/60 shadow-[0_0_12px_rgba(236,72,153,0.4)]'
                    : 'border-muted/40 hover:border-neon-pink/60',
            )}
        >
            {!placeholder ? (
                <img
                    src={map.imageUrl}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    loading="lazy"
                    decoding="async"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
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
