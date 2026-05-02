import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GeoPlayableGame } from '@the-box/types'
import { Search, MapPin, Image as ImageIcon, Loader2 } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'
import { isPlaceholderImageUrl } from '@/lib/geo-image'

interface GamePickerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    games: GeoPlayableGame[]
    isLoading: boolean
    selectedGameId: number | null
    onSelect: (gameId: number) => void
}

/**
 * Bottom-drawer picker on mobile, right-side sheet on desktop. Searchable,
 * keyboard-navigable (radiogroup pattern, see Geo a11y notes), and renders
 * cover art with map / screenshot count badges so the player can scan the
 * catalog at a glance.
 */
export function GamePicker({
    open,
    onOpenChange,
    games,
    isLoading,
    selectedGameId,
    onSelect,
}: GamePickerProps) {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    const [query, setQuery] = useState('')

    // Reset the search field every time the sheet re-opens — keeping a
    // stale query across opens reads as a bug ("why am I still seeing my
    // last search?") more often than as a convenience.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local state to the parent-controlled `open` transition; no external system to subscribe to.
        if (open) setQuery('')
    }, [open])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return games
        return games.filter((g) => g.name.toLowerCase().includes(q))
    }, [games, query])

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side={isMobile ? 'bottom' : 'right'}
                className={cn(
                    'p-0 flex flex-col gap-0',
                    isMobile
                        ? 'h-[85dvh] rounded-t-2xl'
                        : 'sm:max-w-md w-full h-full',
                )}
            >
                <SheetHeader className="p-4 pb-2 text-left space-y-2">
                    <SheetTitle>{t('geo.play.pickGame', 'Pick a game')}</SheetTitle>
                    <SheetDescription>
                        {t(
                            'geo.play.pickGameHint',
                            'All games with at least one playable screenshot.',
                        )}
                    </SheetDescription>
                    <div className="relative">
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                            aria-hidden
                        />
                        <Input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t(
                                'geo.play.searchGamesPlaceholder',
                                'Search games…',
                            )}
                            aria-label={t('geo.play.searchGames', 'Search games')}
                            className="pl-9"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
                    {isLoading ? (
                        <div
                            className="flex justify-center py-16"
                            role="status"
                            aria-live="polite"
                        >
                            <Loader2 className="h-6 w-6 animate-spin text-neon-pink" aria-hidden />
                            <span className="sr-only">
                                {t('common.loading', 'Loading…')}
                            </span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="py-12 text-center text-sm text-muted-foreground">
                            {games.length === 0
                                ? t(
                                      'geo.play.noGamesYet',
                                      'No games are available for free play yet.',
                                  )
                                : t('geo.play.noGamesFound', 'No games match your search.')}
                        </p>
                    ) : (
                        <ul
                            role="radiogroup"
                            aria-label={t('geo.play.pickGame', 'Pick a game')}
                            className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-1"
                        >
                            {filtered.map((g) => (
                                <li key={g.id}>
                                    <GameCard
                                        game={g}
                                        selected={selectedGameId === g.id}
                                        onSelect={() => {
                                            onSelect(g.id)
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

function GameCard({
    game,
    selected,
    onSelect,
}: {
    game: GeoPlayableGame
    selected: boolean
    onSelect: () => void
}) {
    const { t } = useTranslation()
    const cover = game.coverImageUrl && !isPlaceholderImageUrl(game.coverImageUrl)
        ? game.coverImageUrl
        : null
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={onSelect}
            className={cn(
                'group relative w-full overflow-hidden rounded-lg border bg-card text-left transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink',
                selected
                    ? 'border-neon-pink ring-2 ring-neon-pink/60'
                    : 'border-border hover:border-neon-pink/60',
            )}
        >
            <div className="aspect-video w-full bg-muted/30 sm:aspect-[16/7]">
                {cover ? (
                    <img
                        src={cover}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        {game.name}
                    </div>
                )}
            </div>
            <div className="p-3 space-y-1">
                <p className="font-medium text-sm leading-tight line-clamp-2">{game.name}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {t('geo.play.mapCount', '{{count}} maps', { count: game.mapCount })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" aria-hidden />
                        {t('geo.play.screenshotCount', '{{count}} shots', {
                            count: game.screenshotCount,
                        })}
                    </span>
                </div>
            </div>
        </button>
    )
}
