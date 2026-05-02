import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ArrowLeft,
    ArrowRight,
    Gamepad2,
    Loader2,
    Map as MapIcon,
    RefreshCw,
    Shuffle,
    Trophy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGeoFreePlayStore } from '@/stores/geoFreePlayStore'
import { useFullscreen } from '@/hooks/useFullscreen'
import { GamePicker } from '@/components/geo/GamePicker'
import { MapPicker } from '@/components/geo/MapPicker'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { ImmersiveLayout } from '@/components/geo/ImmersiveLayout'
import { FullscreenToggle } from '@/components/geo/FullscreenToggle'
import { isPlaceholderImageUrl } from '@/lib/geo-image'
import { cn } from '@/lib/utils'

/**
 * Free-play geo browser. Pick any game, any map, any time — unranked. The
 * page is mobile-first: a single screenshot↔map deck (swipe / tab to
 * toggle) and a sticky bottom dock for actions. Native fullscreen is the
 * primary feature; on browsers that block it on `<div>` (iOS Safari) we
 * fall back to a CSS-immersive layout that still hides app chrome.
 *
 * Free-play state is held in `useGeoFreePlayStore` and is independent of
 * the daily-challenge store, so a free-play round can never write to the
 * leaderboard or pollute the daily resume.
 */
export default function GeoPlayPage() {
    const { i18n } = useTranslation()

    const {
        games,
        gamesFetchedAt,
        currentGameId,
        currentMapId,
        maps,
        view,
        pendingGuess,
        result,
        correctMap,
        phase,
        errorMessage,
        round,
        playedByGame,
        loadGames,
        selectGame,
        selectMap,
        rerollScreenshot,
        setPendingGuess,
        submitGuess,
        nextRound,
        checkForNewScreenshots,
    } = useGeoFreePlayStore()

    const [gamePickerOpen, setGamePickerOpen] = useState(false)
    const [mapPickerOpen, setMapPickerOpen] = useState(false)

    // Fullscreen target: the entire immersive deck. Putting the wrapper
    // ref on the outer container means the screenshot, map, dock and
    // overlays all enter fullscreen together.
    const rootRef = useRef<HTMLDivElement>(null)
    const fullscreen = useFullscreen(rootRef)

    // Boot: hydrate the games list (cached for 5 min) and, if the user
    // had a game selected last session, auto-load a screenshot for it.
    useEffect(() => {
        loadGames()
    }, [loadGames])

    useEffect(() => {
        if (currentGameId != null && !view && phase === 'idle') {
            void rerollScreenshot()
        }
    }, [currentGameId, view, phase, rerollScreenshot])

    // Open the game picker for a fresh visitor with no selection — gives
    // them an obvious "what do I do here" cue instead of a blank canvas.
    useEffect(() => {
        if (currentGameId == null && games.length > 0 && !gamePickerOpen) {
            setGamePickerOpen(true)
        }
        // We deliberately depend on `games.length` going from 0 → N once;
        // re-opening on every change would fight the player.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [games.length])

    const isMultiMap = maps.length > 1
    const selectedMap = useMemo(
        () => maps.find((m) => m.id === currentMapId) ?? null,
        [maps, currentMapId],
    )
    const currentGame = useMemo(
        () => games.find((g) => g.id === currentGameId) ?? null,
        [games, currentGameId],
    )

    const canSubmit =
        phase === 'ready' &&
        !!pendingGuess &&
        !!view &&
        (selectedMap != null || maps.length === 1)

    const handleSubmit = async () => {
        await submitGuess()
    }

    return (
        <div ref={rootRef} className="bg-black">
            <ImmersiveLayout
                isImmersive={fullscreen.isImmersive}
                roundKey={`${currentGameId ?? 'none'}-${round}`}
                topRight={
                    <FullscreenToggle
                        isImmersive={fullscreen.isImmersive}
                        onToggle={() => void fullscreen.toggle()}
                        isNativeSupported={fullscreen.isSupported}
                    />
                }
                screenshot={
                    <ScreenshotPanel
                        imageUrl={view?.candidate.imageUrl ?? null}
                        loading={phase === 'loading' || (currentGameId != null && phase === 'idle')}
                        empty={currentGameId == null}
                        exhausted={phase === 'exhausted'}
                        errorMessage={phase === 'error' ? errorMessage : null}
                        onPickGame={() => setGamePickerOpen(true)}
                        onCheckForNew={() => void checkForNewScreenshots()}
                    />
                }
                map={
                    selectedMap ? (
                        <GeoMapCanvas
                            imageUrl={selectedMap.imageUrl}
                            widthPx={selectedMap.widthPx}
                            heightPx={selectedMap.heightPx}
                            pin={pendingGuess ?? result?.guess ?? null}
                            canonical={
                                phase === 'revealed' &&
                                correctMap &&
                                selectedMap.id === correctMap.id
                                    ? result?.canonical ?? null
                                    : null
                            }
                            disabled={phase !== 'ready'}
                            onPin={setPendingGuess}
                            showGuessLine={
                                phase === 'revealed' &&
                                !!correctMap &&
                                selectedMap.id === correctMap.id
                            }
                            className="!rounded-none h-full"
                        />
                    ) : (
                        <MapPlaceholder
                            hasGame={currentGameId != null}
                            multiMap={isMultiMap}
                            onPickMap={() => setMapPickerOpen(true)}
                        />
                    )
                }
                resultOverlay={
                    phase === 'revealed' && result ? (
                        <ResultOverlay
                            score={result.score}
                            distance={result.distance}
                            wrongMap={!!result.wrongMap}
                            language={i18n.language}
                        />
                    ) : null
                }
                bottomDock={
                    <Dock
                        gameLabel={currentGame?.name ?? null}
                        mapLabel={selectedMap?.region ?? null}
                        showMapButton={isMultiMap || currentGameId == null}
                        onChangeGame={() => setGamePickerOpen(true)}
                        onChangeMap={() => setMapPickerOpen(true)}
                        onReroll={() => void rerollScreenshot()}
                        onSubmit={handleSubmit}
                        onNext={() => void nextRound()}
                        canSubmit={canSubmit}
                        phase={phase}
                    />
                }
            />

            <GamePicker
                open={gamePickerOpen}
                onOpenChange={setGamePickerOpen}
                games={games}
                isLoading={gamesFetchedAt == null && games.length === 0}
                selectedGameId={currentGameId}
                playedCountByGame={Object.fromEntries(
                    Object.entries(playedByGame).map(([id, ids]) => [id, ids.length]),
                )}
                onSelect={(id) => void selectGame(id)}
            />
            <MapPicker
                open={mapPickerOpen}
                onOpenChange={setMapPickerOpen}
                maps={maps}
                selectedMapId={currentMapId}
                onSelect={(id) => void selectMap(id)}
                showAnyMapOption={isMultiMap}
            />
        </div>
    )
}

function ScreenshotPanel({
    imageUrl,
    loading,
    empty,
    exhausted,
    errorMessage,
    onPickGame,
    onCheckForNew,
}: {
    imageUrl: string | null
    loading: boolean
    empty: boolean
    exhausted: boolean
    errorMessage: string | null
    onPickGame: () => void
    onCheckForNew: () => void
}) {
    const { t } = useTranslation()
    const safeUrl = imageUrl && !isPlaceholderImageUrl(imageUrl) ? imageUrl : null

    if (exhausted) {
        return (
            <div
                className="flex h-full w-full flex-col items-center justify-center px-6 text-center gap-4"
                role="status"
            >
                <div className="rounded-full bg-neon-pink/10 p-4">
                    <Trophy className="h-8 w-8 text-neon-pink" aria-hidden />
                </div>
                <div className="space-y-1 max-w-xs">
                    <h2 className="text-lg font-semibold">
                        {t('geo.play.exhausted.title', "You've seen every screenshot")}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {t(
                            'geo.play.exhausted.body',
                            "Nice run! You've guessed every available screenshot for this game. We'll let you know when new ones are added.",
                        )}
                    </p>
                </div>
                <Button
                    onClick={onCheckForNew}
                    variant="outline"
                >
                    <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
                    {t('geo.play.exhausted.checkForNew', 'Check for new screenshots')}
                </Button>
            </div>
        )
    }

    if (errorMessage) {
        return (
            <div
                className="flex h-full w-full items-center justify-center px-6 text-center"
                role="alert"
            >
                <p className="text-sm text-destructive">{errorMessage}</p>
            </div>
        )
    }

    if (empty) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center gap-4">
                <div className="rounded-full bg-neon-pink/10 p-4">
                    <Gamepad2 className="h-8 w-8 text-neon-pink" aria-hidden />
                </div>
                <div className="space-y-1 max-w-xs">
                    <h2 className="text-lg font-semibold">
                        {t('geo.play.empty.title', 'Pick a game to start')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {t(
                            'geo.play.empty.body',
                            'Free play covers every game and every map in the catalog. No daily limits.',
                        )}
                    </p>
                </div>
                <Button onClick={onPickGame} className="gradient-gaming hover:opacity-90">
                    <Gamepad2 className="h-4 w-4 mr-2" aria-hidden />
                    {t('geo.play.empty.cta', 'Browse games')}
                </Button>
            </div>
        )
    }

    if (loading || !safeUrl) {
        return (
            <div
                className="flex h-full w-full items-center justify-center"
                role="status"
                aria-busy="true"
            >
                <Loader2 className="h-8 w-8 animate-spin text-neon-pink" aria-hidden />
                <span className="sr-only">{t('common.loading', 'Loading…')}</span>
            </div>
        )
    }

    return (
        <img
            src={safeUrl}
            alt={t('geo.daily.screenshot', 'Screenshot')}
            className="h-full w-full object-contain"
            loading="eager"
            decoding="async"
        />
    )
}

function MapPlaceholder({
    hasGame,
    multiMap,
    onPickMap,
}: {
    hasGame: boolean
    multiMap: boolean
    onPickMap: () => void
}) {
    const { t } = useTranslation()
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <MapIcon className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground max-w-xs">
                {!hasGame
                    ? t(
                          'geo.play.map.empty.noGame',
                          'Pick a game first — the map list shows up here once you have one.',
                      )
                    : multiMap
                      ? t(
                            'geo.play.map.empty.multi',
                            'This game has several maps. Pick one to start guessing.',
                        )
                      : t(
                            'geo.play.map.empty.none',
                            'No playable maps for this game yet.',
                        )}
            </p>
            {hasGame && multiMap && (
                <Button onClick={onPickMap} variant="outline">
                    <MapIcon className="h-4 w-4 mr-2" aria-hidden />
                    {t('geo.play.pickMap', 'Pick a map')}
                </Button>
            )}
        </div>
    )
}

function ResultOverlay({
    score,
    distance,
    wrongMap,
    language,
}: {
    score: number
    distance: number
    wrongMap: boolean
    language: string
}) {
    const { t } = useTranslation()
    return (
        <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cn(
                'mx-auto max-w-md rounded-2xl border bg-black/70 px-4 py-3 backdrop-blur',
                wrongMap ? 'border-destructive/50' : 'border-neon-pink/50',
            )}
        >
            <div className="flex items-center justify-between gap-3 text-white">
                <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-neon-pink" aria-hidden />
                    <span className="font-semibold text-lg">
                        {score.toLocaleString(language)}
                    </span>
                    <span className="text-xs text-white/70">
                        {t('geo.daily.score', 'Score')}
                    </span>
                </div>
                <span className="text-xs text-white/70">
                    {t('geo.daily.distance', 'Distance')}: {(distance * 100).toFixed(1)}%
                </span>
            </div>
            {wrongMap && (
                <p className="mt-1 text-xs text-destructive">
                    {t('geo.daily.wrongMap.banner', 'Wrong map — score floored.')}
                </p>
            )}
        </div>
    )
}

function Dock({
    gameLabel,
    mapLabel,
    showMapButton,
    onChangeGame,
    onChangeMap,
    onReroll,
    onSubmit,
    onNext,
    canSubmit,
    phase,
}: {
    gameLabel: string | null
    mapLabel: string | null
    showMapButton: boolean
    onChangeGame: () => void
    onChangeMap: () => void
    onReroll: () => void
    onSubmit: () => void
    onNext: () => void
    canSubmit: boolean
    phase: ReturnType<typeof useGeoFreePlayStore.getState>['phase']
}) {
    const { t } = useTranslation()
    const submitting = phase === 'submitting'
    const revealed = phase === 'revealed'
    const exhausted = phase === 'exhausted'
    return (
        <div className="flex flex-col gap-2">
            {/* Context row — game / map labels with quick-change links.
                Tappable, so the player never has to leave the immersive
                view to switch context. */}
            <div className="flex items-center gap-2 text-xs text-white/80 min-h-[1.5rem]">
                <button
                    type="button"
                    onClick={onChangeGame}
                    className="inline-flex items-center gap-1 rounded-full border border-white/20 px-2.5 py-0.5 hover:border-neon-pink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
                >
                    <Gamepad2 className="h-3 w-3" aria-hidden />
                    <span className="max-w-[10rem] truncate">
                        {gameLabel ?? t('geo.play.changeGame', 'Choose game')}
                    </span>
                </button>
                {showMapButton && (
                    <button
                        type="button"
                        onClick={onChangeMap}
                        className="inline-flex items-center gap-1 rounded-full border border-white/20 px-2.5 py-0.5 hover:border-neon-pink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
                    >
                        <MapIcon className="h-3 w-3" aria-hidden />
                        <span className="max-w-[10rem] truncate">
                            {mapLabel ?? t('geo.play.changeMap', 'Choose map')}
                        </span>
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onReroll}
                    className="text-white/80 hover:text-white"
                    disabled={submitting || exhausted || gameLabel == null}
                    aria-label={t('geo.play.reroll', 'New screenshot')}
                >
                    <Shuffle className="h-4 w-4 mr-1.5" aria-hidden />
                    <span className="hidden sm:inline">
                        {t('geo.play.reroll', 'New screenshot')}
                    </span>
                </Button>

                <div className="flex-1" />

                {revealed ? (
                    <Button
                        type="button"
                        onClick={onNext}
                        className="gradient-gaming hover:opacity-90 min-h-11 min-w-32"
                    >
                        {t('geo.play.next', 'Next round')}
                        <ArrowRight className="h-4 w-4 ml-2" aria-hidden />
                    </Button>
                ) : (
                    <Button
                        type="button"
                        onClick={onSubmit}
                        disabled={!canSubmit || submitting}
                        className="gradient-gaming hover:opacity-90 min-h-11 min-w-32"
                    >
                        {submitting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                        ) : (
                            <ArrowLeft className="h-4 w-4 mr-2 rotate-180" aria-hidden />
                        )}
                        {t('geo.play.submit', 'Drop pin')}
                    </Button>
                )}
            </div>
        </div>
    )
}
