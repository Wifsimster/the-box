import { forwardRef, useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import { useRovingTabindex } from '@/hooks/useRovingTabindex'
import { useTranslation } from 'react-i18next'
import type { GeoPlayableGame } from '@the-box/types'
import {
    CheckCircle2,
    Eye,
    EyeOff,
    Image as ImageIcon,
    Loader2,
    MapPin,
    Search,
    Sparkles,
} from 'lucide-react'
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
    // How many screenshots the user has already played per game id, used
    // to flag games whose catalog has grown since their last visit.
    playedCountByGame?: Record<string, number>
    // Game ids the player has opted out of — kept visible (so they can
    // un-ignore) but visually de-emphasized and excluded from completion.
    ignoredGameIds?: number[]
    onSelect: (gameId: number) => void
    onToggleIgnore?: (gameId: number) => void
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
    playedCountByGame,
    ignoredGameIds,
    onSelect,
    onToggleIgnore,
}: GamePickerProps) {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    const [query, setQuery] = useState('')
    const ignoredSet = useMemo(
        () => new Set(ignoredGameIds ?? []),
        [ignoredGameIds],
    )

    // Clear the search field on close — keeping a stale query across opens
    // reads as a bug ("why am I still seeing my last search?") more often
    // than as a convenience. Doing it on close (rather than on open in an
    // effect) avoids the open→stale-query→cleared-query paint flash and
    // means the input is already empty by the time the sheet animates in.
    const handleOpenChange = useCallback(
        (next: boolean) => {
            if (!next) setQuery('')
            onOpenChange(next)
        },
        [onOpenChange],
    )

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return games
        return games.filter((g) => g.name.toLowerCase().includes(q))
    }, [games, query])

    // Roving tabindex for the radiogroup — Tab moves into the group at
    // the currently-selected (or first) card, arrow keys cycle focus
    // inside without firing onSelect, Space/Enter on a focused card
    // commits via the button's native click semantics.
    const initialIndex = Math.max(
        0,
        filtered.findIndex((g) => g.id === selectedGameId),
    )
    const { getItemProps } = useRovingTabindex<HTMLButtonElement>({
        count: filtered.length,
        initialIndex,
    })

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent
                side={isMobile ? 'bottom' : 'right'}
                className={cn(
                    'p-0 flex flex-col gap-0',
                    isMobile
                        ? 'h-[85dvh] rounded-t-2xl'
                        : 'sm:max-w-md size-full',
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
                            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
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
                            <Loader2 className="size-6 animate-spin text-neon-pink" aria-hidden />
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
                            className="grid grid-cols-1 gap-3 pt-2"
                        >
                            {filtered.map((g, index) => {
                                const played = playedCountByGame?.[String(g.id)] ?? 0
                                // Clamp to ≥0 in case the catalog count
                                // shrank (e.g. an admin demoted a meta).
                                const newCount = Math.max(0, g.screenshotCount - played)
                                // Only flag "new" once the player has
                                // actually started this game — otherwise
                                // every entry would scream "NEW".
                                const hasNew = played > 0 && newCount > 0
                                const completed =
                                    g.screenshotCount > 0 && played >= g.screenshotCount
                                const ignored = ignoredSet.has(g.id)
                                return (
                                    <li key={g.id}>
                                        <GameCard
                                            {...getItemProps(index)}
                                            game={g}
                                            selected={selectedGameId === g.id}
                                            newCount={hasNew ? newCount : 0}
                                            completed={completed}
                                            ignored={ignored}
                                            onSelect={() => {
                                                onSelect(g.id)
                                                handleOpenChange(false)
                                            }}
                                            onToggleIgnore={
                                                onToggleIgnore
                                                    ? () => onToggleIgnore(g.id)
                                                    : undefined
                                            }
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

interface GameCardProps {
    game: GeoPlayableGame
    selected: boolean
    newCount: number
    completed: boolean
    ignored: boolean
    tabIndex: number
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
    onSelect: () => void
    onToggleIgnore?: () => void
}

const GameCard = forwardRef<HTMLButtonElement, GameCardProps>(function GameCard(
    {
        game,
        selected,
        newCount,
        completed,
        ignored,
        tabIndex,
        onKeyDown,
        onSelect,
        onToggleIgnore,
    },
    ref,
) {
    const { t } = useTranslation()
    const cover = game.coverImageUrl && !isPlaceholderImageUrl(game.coverImageUrl)
        ? game.coverImageUrl
        : null
    return (
        <div
            className={cn(
                'group relative w-full overflow-hidden rounded-lg border bg-card text-left transition',
                selected
                    ? 'border-neon-pink ring-2 ring-neon-pink/60'
                    : 'border-border hover:border-neon-pink/60',
                ignored && 'opacity-60',
            )}
        >
            <button
                ref={ref}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={tabIndex}
                onKeyDown={onKeyDown}
                onClick={onSelect}
                className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
            >
                {newCount > 0 && !completed && !ignored && (
                    <span
                        className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-neon-pink px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg"
                        aria-label={t('geo.play.newCaptures', '{{count}} new screenshots to guess', {
                            count: newCount,
                        })}
                    >
                        <Sparkles className="size-3" aria-hidden />
                        {t('geo.play.newBadge', '+{{count}} new', { count: newCount })}
                    </span>
                )}
                {completed && !ignored && (
                    <span
                        className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg"
                    >
                        <CheckCircle2 className="size-3" aria-hidden />
                        {t('geo.play.completedBadge', 'All seen')}
                    </span>
                )}
                {ignored && (
                    <span
                        className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-muted-foreground/80 px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg"
                    >
                        <EyeOff className="size-3" aria-hidden />
                        {t('geo.play.ignoredBadge', 'Ignored')}
                    </span>
                )}
                <div className="aspect-video w-full bg-muted/30 sm:aspect-[16/7]">
                    {cover ? (
                        <img
                            src={cover}
                            alt=""
                            className={cn(
                                'size-full object-cover',
                                ignored && 'grayscale',
                            )}
                            loading="lazy"
                            decoding="async"
                        />
                    ) : (
                        <div className="flex size-full items-center justify-center text-xs text-muted-foreground" lang="en">
                            {game.name}
                        </div>
                    )}
                </div>
                <div className="p-3 space-y-1">
                    <p className="font-medium text-sm leading-tight line-clamp-2" lang="en">{game.name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" aria-hidden />
                            {t('geo.play.mapCount', '{{count}} maps', { count: game.mapCount })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <ImageIcon className="size-3" aria-hidden />
                            {t('geo.play.screenshotCount', '{{count}} shots', {
                                count: game.screenshotCount,
                            })}
                        </span>
                    </div>
                </div>
            </button>
            {onToggleIgnore && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggleIgnore()
                    }}
                    className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur hover:border-neon-pink/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
                    aria-label={
                        ignored
                            ? t('geo.play.unmarkIgnored', 'Restore this game')
                            : t('geo.play.markIgnored', "I don't know this game")
                    }
                >
                    {ignored ? (
                        <Eye className="size-3" aria-hidden />
                    ) : (
                        <EyeOff className="size-3" aria-hidden />
                    )}
                    <span className="hidden sm:inline">
                        {ignored
                            ? t('geo.play.unmarkIgnoredShort', 'Restore')
                            : t('geo.play.markIgnoredShort', "Don't know")}
                    </span>
                </button>
            )}
        </div>
    )
})
