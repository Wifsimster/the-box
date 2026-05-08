import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { GeoPoint } from '@the-box/types'
import {
    ArrowRight,
    Check,
    ChevronLeft,
    ChevronRight,
    EyeOff,
    Gamepad2,
    Loader2,
    Map as MapIcon,
    MapPin,
    RefreshCw,
    Shuffle,
    Sparkles,
    Trophy,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useGeoFreePlayStore } from '@/stores/geoFreePlayStore'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useFullscreen } from '@/hooks/useFullscreen'
import { geoApi } from '@/lib/api/geo'
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
// Light haptic feedback for the two-step pin flow. Called on the
// initial pin drop (single tick) and again on submit (longer pulse).
// `navigator.vibrate` is a no-op on iOS Safari and any browser without
// the Vibration API — failure is silent and there's nothing to fall
// back to, so we just guard the call.
function vibrate(pattern: number | number[]): void {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
            navigator.vibrate(pattern)
        } catch {
            /* ignore — Android sometimes throws if the page is hidden */
        }
    }
}

export default function GeoPlayPage() {
    const { t, i18n } = useTranslation()
    const { localizedPath } = useLocalizedPath()

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
        ignoredGameIds,
        history,
        historyIndex,
        loadGames,
        selectGame,
        selectMap,
        rerollScreenshot,
        pickRandomAcrossGames,
        goPrevious,
        goNext,
        setPendingGuess,
        submitGuess,
        nextRound,
        checkForNewScreenshots,
        toggleIgnoreGame,
    } = useGeoFreePlayStore()

    const [gamePickerOpen, setGamePickerOpen] = useState(false)
    const [mapPickerOpen, setMapPickerOpen] = useState(false)
    // Cold-start social proof: count of pins submitted today (UTC).
    // One-shot fetch on mount; null until it lands so the empty state
    // doesn't flash a misleading "0 pins today" placeholder.
    const [pinsToday, setPinsToday] = useState<number | null>(null)
    // Screen-reader announcement for the placed pin. The CTA's
    // aria-live carries the action signal ("Drop pin" → "Confirm
    // pin"); this carries the spatial signal ("placed at 42 %, 67 %")
    // so an AT user knows roughly where their pin landed without
    // sighted feedback. Mirrors what the persona a11y review asked
    // for under WCAG 2.4.6 / 4.1.3.
    const [pinAnnouncement, setPinAnnouncement] = useState('')

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

    // Boot: pull the dataset social-proof counter. Failure is silent —
    // the empty state degrades gracefully when this number is null.
    useEffect(() => {
        let cancelled = false
        geoApi
            .getTodayStats()
            .then((stats) => {
                if (!cancelled) setPinsToday(stats.totalPinsToday)
            })
            .catch(() => {
                /* ignore — counter is decorative, not blocking */
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (currentGameId != null && !view && phase === 'idle') {
            void rerollScreenshot()
        }
    }, [currentGameId, view, phase, rerollScreenshot])

    // Announce the placed pin to screen readers. Coordinates are
    // rounded to whole percent so the message stays terse — anything
    // finer is noise once verbalized. Cleared when the pin is removed
    // (e.g. after a round resets) so the live region doesn't replay
    // the last announcement on phase changes.
    useEffect(() => {
        if (!pendingGuess) {
            setPinAnnouncement('')
            return
        }
        setPinAnnouncement(
            t('geo.play.pinPlacedAria', {
                defaultValue: 'Pin placed at {{x}}%, {{y}}%',
                x: Math.round(pendingGuess.x * 100),
                y: Math.round(pendingGuess.y * 100),
            }),
        )
    }, [pendingGuess, t])

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

    const ignoredSet = useMemo(() => new Set(ignoredGameIds), [ignoredGameIds])

    // "All-time done" — true when every catalog game the player hasn't
    // ignored has its full set of screenshots already played. Computed
    // from local state (playedByGame) plus the catalog `screenshotCount`,
    // so it stays accurate as the catalog grows.
    const allGamesCompleted = useMemo(() => {
        const considered = games.filter((g) => !ignoredSet.has(g.id))
        if (considered.length === 0) return false
        return considered.every((g) => {
            const played = playedByGame[g.id]?.length ?? 0
            return g.screenshotCount > 0 && played >= g.screenshotCount
        })
    }, [games, ignoredSet, playedByGame])

    // When the current game runs out of captures but the catalog still has
    // unplayed screenshots elsewhere, silently switch to another game
    // instead of showing a per-game "you've seen everything" notice. The
    // exhausted UI is reserved for the all-catalog-done case.
    useEffect(() => {
        if (phase === 'exhausted' && !allGamesCompleted) {
            void pickRandomAcrossGames()
        }
    }, [phase, allGamesCompleted, pickRandomAcrossGames])

    const canSubmit =
        phase === 'ready' &&
        !!pendingGuess &&
        !!view &&
        (selectedMap != null || maps.length === 1)

    // Two-step pin: first map tap drops a draft (light tick), then the
    // dock CTA confirms (longer pulse). Haptics are a no-op on iOS Safari
    // and any browser without the Vibration API, which is fine — the
    // visual CTA flip carries the same signal.
    const handleMapPin = (p: GeoPoint | null) => {
        const wasEmpty = !pendingGuess
        setPendingGuess(p)
        if (p && wasEmpty) vibrate(10)
    }

    const handleSubmit = async () => {
        vibrate([15, 25, 15])
        await submitGuess()
    }

    return (
        <div ref={rootRef} className="bg-black">
            {/* Visually hidden live region for the pin-placement
                announcement. Lives at the top of the page so AT
                cursors don't have to scrub down to find the result. */}
            <div role="status" aria-live="polite" className="sr-only">
                {pinAnnouncement}
            </div>
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
                        gameName={currentGame?.name ?? null}
                        loading={phase === 'loading' || (currentGameId != null && phase === 'idle')}
                        empty={currentGameId == null}
                        exhausted={phase === 'exhausted'}
                        allCompleted={allGamesCompleted}
                        authRequired={phase === 'authRequired'}
                        loginHref={localizedPath('/login')}
                        registerHref={localizedPath('/register')}
                        pinsToday={pinsToday}
                        language={i18n.language}
                        canIgnoreCurrent={
                            phase === 'exhausted' &&
                            currentGameId != null &&
                            !ignoredSet.has(currentGameId)
                        }
                        errorMessage={phase === 'error' ? errorMessage : null}
                        onPickGame={() => setGamePickerOpen(true)}
                        onCheckForNew={() => void checkForNewScreenshots()}
                        onIgnoreCurrent={() => {
                            if (currentGameId != null) {
                                toggleIgnoreGame(currentGameId)
                                setGamePickerOpen(true)
                            }
                        }}
                    />
                }
                map={
                    selectedMap ? (
                        <GeoMapCanvas
                            imageUrl={selectedMap.imageUrl}
                            widthPx={selectedMap.widthPx}
                            heightPx={selectedMap.heightPx}
                            tiles={selectedMap.tiles}
                            pin={pendingGuess ?? result?.guess ?? null}
                            canonical={
                                phase === 'revealed' &&
                                correctMap &&
                                selectedMap.id === correctMap.id
                                    ? result?.canonical ?? null
                                    : null
                            }
                            disabled={phase !== 'ready'}
                            onPin={handleMapPin}
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
                            pinCount={result.pinCount}
                            language={i18n.language}
                        />
                    ) : null
                }
                topBar={
                    <ContextHeader
                        gameLabel={currentGame?.name ?? null}
                        mapLabel={selectedMap?.region ?? null}
                        showMapButton={isMultiMap || currentGameId == null}
                        onChangeGame={() => setGamePickerOpen(true)}
                        onChangeMap={() => setMapPickerOpen(true)}
                    />
                }
                bottomDock={
                    <Dock
                        onShuffleAllGames={() => void pickRandomAcrossGames()}
                        onPrevious={goPrevious}
                        onNext={() => void goNext()}
                        canGoPrevious={historyIndex > 0}
                        canGoNext={
                            historyIndex < history.length - 1 || currentGameId != null
                        }
                        onSubmit={handleSubmit}
                        onNextRound={() => void nextRound()}
                        onSkip={() => void rerollScreenshot()}
                        onPlaceByCoords={handleMapPin}
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
                ignoredGameIds={ignoredGameIds}
                onSelect={(id) => void selectGame(id)}
                onToggleIgnore={toggleIgnoreGame}
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
    gameName,
    loading,
    empty,
    exhausted,
    allCompleted,
    authRequired,
    loginHref,
    registerHref,
    pinsToday,
    language,
    canIgnoreCurrent,
    errorMessage,
    onPickGame,
    onCheckForNew,
    onIgnoreCurrent,
}: {
    imageUrl: string | null
    gameName: string | null
    loading: boolean
    empty: boolean
    exhausted: boolean
    allCompleted: boolean
    authRequired: boolean
    loginHref: string
    registerHref: string
    pinsToday: number | null
    language: string
    canIgnoreCurrent: boolean
    errorMessage: string | null
    onPickGame: () => void
    onCheckForNew: () => void
    onIgnoreCurrent: () => void
}) {
    const { t } = useTranslation()
    const safeUrl = imageUrl && !isPlaceholderImageUrl(imageUrl) ? imageUrl : null

    if (exhausted && allCompleted) {
        return (
            <div
                className="flex h-full w-full flex-col items-center justify-center px-6 text-center gap-4"
                role="status"
            >
                <div className="rounded-full bg-neon-pink/10 p-4">
                    <Sparkles className="h-8 w-8 text-neon-pink" aria-hidden />
                </div>
                <div className="space-y-1 max-w-sm">
                    <h2 className="text-lg font-semibold">
                        {t('geo.play.allDone.title', "You've completed The Box!")}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {t(
                            'geo.play.allDone.body',
                            "Bravo! You've guessed every screenshot in every game in your catalog. We'll ping you when new ones are added.",
                        )}
                    </p>
                </div>
                <Button onClick={onCheckForNew} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
                    {t('geo.play.exhausted.checkForNew', 'Check for new screenshots')}
                </Button>
            </div>
        )
    }

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
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button onClick={onPickGame} className="gradient-gaming hover:opacity-90">
                        <Gamepad2 className="h-4 w-4 mr-2" aria-hidden />
                        {t('geo.play.exhausted.pickAnother', 'Pick another game')}
                    </Button>
                    <Button onClick={onCheckForNew} variant="outline">
                        <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
                        {t('geo.play.exhausted.checkForNew', 'Check for new screenshots')}
                    </Button>
                </div>
                {canIgnoreCurrent && (
                    <button
                        type="button"
                        onClick={onIgnoreCurrent}
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                    >
                        <EyeOff className="h-3.5 w-3.5" aria-hidden />
                        {t(
                            'geo.play.exhausted.markIgnored',
                            "I don't want to see this game again",
                        )}
                    </button>
                )}
            </div>
        )
    }

    if (authRequired) {
        return (
            <div
                className="flex h-full w-full flex-col items-center justify-center px-6 text-center gap-4"
                role="status"
            >
                <div className="rounded-full bg-neon-pink/10 p-4">
                    <MapPin className="h-8 w-8 text-neon-pink" aria-hidden />
                </div>
                <div className="space-y-1 max-w-sm">
                    <h2 className="text-lg font-semibold">
                        {t('geo.play.auth.title', 'Sign in to drop pins')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {t(
                            'geo.play.auth.body',
                            'Help us map the world of video games — drop a pin where each scene takes place.',
                        )}
                    </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button asChild className="gradient-gaming hover:opacity-90 min-h-12">
                        <Link to={loginHref}>
                            {t('geo.play.auth.login', 'Sign in')}
                        </Link>
                    </Button>
                    <Button asChild variant="outline" className="min-h-12">
                        <Link to={registerHref}>
                            {t('geo.play.auth.register', 'Create account')}
                        </Link>
                    </Button>
                </div>
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
                    <MapPin className="h-8 w-8 text-neon-pink" aria-hidden />
                </div>
                <div className="space-y-2 max-w-md">
                    <h2 className="text-lg font-semibold">
                        {t('geo.play.empty.title', 'Help us map the world of video games')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {t(
                            'geo.play.empty.body',
                            'Look at a screenshot, then drop a pin where the scene takes place on the game world map. Every pin grows a shared atlas that powers future location-guessing modes.',
                        )}
                    </p>
                </div>
                {/* Cold-start social proof: only render once we have a
                    real number from the server, and only when there's
                    actually been activity today (>0). A "0 pins today"
                    chip would do the opposite of social proof. */}
                {pinsToday != null && pinsToday > 0 && (
                    <p
                        className="inline-flex items-center gap-1.5 rounded-full bg-neon-pink/10 px-3 py-1 text-xs text-white/90"
                        aria-live="polite"
                    >
                        <Sparkles className="h-3 w-3 text-neon-pink" aria-hidden />
                        {t('geo.play.empty.pinsToday', {
                            defaultValue: '{{count}} pins dropped today by the community',
                            count: pinsToday,
                            formatted: pinsToday.toLocaleString(language),
                        })}
                    </p>
                )}
                <ol className="text-left text-xs text-muted-foreground/90 space-y-1.5 max-w-xs">
                    <li className="flex gap-2">
                        <span className="font-semibold text-neon-pink">1.</span>
                        <span>{t('geo.play.empty.steps.one', 'Pick a game from your catalog.')}</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="font-semibold text-neon-pink">2.</span>
                        <span>{t('geo.play.empty.steps.two', 'Tap the map where you think the screenshot was taken.')}</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="font-semibold text-neon-pink">3.</span>
                        <span>{t('geo.play.empty.steps.three', 'Confirm — your pin joins the dataset.')}</span>
                    </li>
                </ol>
                <Button onClick={onPickGame} className="gradient-gaming hover:opacity-90 min-h-12">
                    <Gamepad2 className="h-4 w-4 mr-2" aria-hidden />
                    {t('geo.play.empty.cta', 'Pick a game')}
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

    const altText = gameName
        ? t('geo.daily.screenshotOf', 'Screenshot from {{game}}', { game: gameName })
        : t('geo.daily.screenshot', 'Screenshot')
    return (
        <img
            src={safeUrl}
            alt={altText}
            className="h-full w-full object-contain"
            loading="eager"
            decoding="async"
            fetchPriority="high"
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
    pinCount,
    language,
}: {
    score: number
    distance: number
    wrongMap: boolean
    pinCount: number
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
            <div className="mt-1 flex items-center gap-1 text-xs text-white/70">
                <MapPin className="h-3 w-3 text-neon-pink" aria-hidden />
                <span>{t('geo.daily.pinCount', { count: pinCount })}</span>
            </div>
            {wrongMap && (
                <p className="mt-1 text-xs text-destructive">
                    {t('geo.daily.wrongMap.banner', 'Wrong map — score floored.')}
                </p>
            )}
        </div>
    )
}

function ContextHeader({
    gameLabel,
    mapLabel,
    showMapButton,
    onChangeGame,
    onChangeMap,
}: {
    gameLabel: string | null
    mapLabel: string | null
    showMapButton: boolean
    onChangeGame: () => void
    onChangeMap: () => void
}) {
    const { t } = useTranslation()
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/80">
            <button
                type="button"
                onClick={onChangeGame}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 min-h-11 px-3 py-2 hover:border-neon-pink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
            >
                <Gamepad2 className="h-3.5 w-3.5" aria-hidden />
                <span className="max-w-[14rem] truncate" lang={gameLabel ? 'en' : undefined}>
                    {gameLabel ?? t('geo.play.changeGame', 'Choose game')}
                </span>
            </button>
            {showMapButton && (
                <button
                    type="button"
                    onClick={onChangeMap}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 min-h-11 px-3 py-2 hover:border-neon-pink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
                >
                    <MapIcon className="h-3.5 w-3.5" aria-hidden />
                    <span className="max-w-[14rem] truncate" lang={mapLabel ? 'en' : undefined}>
                        {mapLabel ?? t('geo.play.changeMap', 'Choose map')}
                    </span>
                </button>
            )}
        </div>
    )
}

function Dock({
    onShuffleAllGames,
    onPrevious,
    onNext,
    canGoPrevious,
    canGoNext,
    onSubmit,
    onNextRound,
    onSkip,
    onPlaceByCoords,
    canSubmit,
    phase,
}: {
    onShuffleAllGames: () => void
    onPrevious: () => void
    onNext: () => void
    canGoPrevious: boolean
    canGoNext: boolean
    onSubmit: () => void
    onNextRound: () => void
    onSkip: () => void
    onPlaceByCoords: (point: GeoPoint) => void
    canSubmit: boolean
    phase: ReturnType<typeof useGeoFreePlayStore.getState>['phase']
}) {
    const { t } = useTranslation()
    const submitting = phase === 'submitting'
    const revealed = phase === 'revealed'
    const loading = phase === 'loading'
    return (
        <div className="flex flex-col gap-2">
            {/* Secondary row — navigation through history + shuffle. Compact
                so the primary CTA below it gets full visual weight. */}
            <div className="flex items-center justify-center gap-1.5">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onPrevious}
                    className="h-12 w-12 min-h-12 min-w-12 text-white/80 hover:text-white"
                    disabled={!canGoPrevious || submitting || loading}
                    aria-label={t('geo.play.previous', 'Previous screenshot')}
                    title={t('geo.play.previous', 'Previous screenshot')}
                >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onShuffleAllGames}
                    className="min-h-12 text-white/80 hover:text-white"
                    disabled={submitting || loading}
                    aria-label={t('geo.play.shuffleAllGames', 'Random game')}
                    title={t('geo.play.shuffleAllGames', 'Random game')}
                >
                    <Shuffle className="h-4 w-4 sm:mr-1.5" aria-hidden />
                    <span className="hidden sm:inline">
                        {t('geo.play.shuffleAllGames', 'Random game')}
                    </span>
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onNext}
                    className="h-12 w-12 min-h-12 min-w-12 text-white/80 hover:text-white"
                    disabled={!canGoNext || submitting || loading}
                    aria-label={t('geo.play.nextScreenshot', 'Next screenshot')}
                    title={t('geo.play.nextScreenshot', 'Next screenshot')}
                >
                    <ChevronRight className="h-5 w-5" aria-hidden />
                </Button>
            </div>

            {/* Primary row — single full-width CTA. Fills the thumb-zone on
                mobile and matches Fitts: bigger target, no neighbours
                competing for taps. */}
            {revealed ? (
                <Button
                    type="button"
                    onClick={onNextRound}
                    className="gradient-gaming hover:opacity-90 min-h-12 w-full"
                >
                    {t('geo.play.next', 'Next round')}
                    <ArrowRight className="h-4 w-4 ml-2" aria-hidden />
                </Button>
            ) : (
                <Button
                    type="button"
                    onClick={onSubmit}
                    disabled={!canSubmit || submitting}
                    className="gradient-gaming hover:opacity-90 min-h-12 w-full"
                    aria-live="polite"
                >
                    {submitting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                    ) : canSubmit ? (
                        <Check className="h-4 w-4 mr-2" aria-hidden />
                    ) : (
                        <MapPin className="h-4 w-4 mr-2" aria-hidden />
                    )}
                    {canSubmit
                        ? t('geo.play.confirm', 'Confirm pin')
                        : t('geo.play.submit', 'Drop pin')}
                </Button>
            )}

            {/* Skip affordance — shown only while waiting for a pin (no
                draft, not yet revealed). A discoverable "I don't know"
                escape hatch protects dataset quality: a player who'd
                otherwise drop a random guess can roll forward instead.
                Hidden once a pin is placed so it doesn't fight the
                primary "Confirm pin" CTA for attention. */}
            {!revealed && !canSubmit && (
                <button
                    type="button"
                    onClick={onSkip}
                    disabled={submitting || loading}
                    className="self-center text-xs text-white/60 underline-offset-4 hover:text-white hover:underline disabled:opacity-40 min-h-9 px-2"
                >
                    {t('geo.play.skip', "I don't know — skip this one")}
                </button>
            )}

            {/* Non-tap pin-placement alternative for keyboard, switch
                control and screen-reader users — Leaflet's keyboard
                pan doesn't synthesize a click on Enter, so without
                this they can't drop a pin at all. Native <details>
                gives full keyboard support out of the box and stays
                collapsed for sighted/touch users so it doesn't add
                visual noise. WCAG 2.1.1 (Keyboard). */}
            {!revealed && !canSubmit && (
                <CoordinateInput
                    onPlace={onPlaceByCoords}
                    disabled={submitting || loading}
                />
            )}
        </div>
    )
}

function CoordinateInput({
    onPlace,
    disabled,
}: {
    onPlace: (point: GeoPoint) => void
    disabled: boolean
}) {
    const { t } = useTranslation()
    const [x, setX] = useState('')
    const [y, setY] = useState('')

    const submit = (e: FormEvent) => {
        e.preventDefault()
        const xNum = Number.parseFloat(x)
        const yNum = Number.parseFloat(y)
        if (!Number.isFinite(xNum) || !Number.isFinite(yNum)) return
        // Inputs are 0-100 percent; clamp + normalize to the [0..1]
        // space the rest of the pipeline uses.
        const clamp = (n: number) => Math.min(100, Math.max(0, n)) / 100
        onPlace({ x: clamp(xNum), y: clamp(yNum) })
    }

    return (
        <details className="self-center text-xs text-white/60">
            <summary className="cursor-pointer underline-offset-4 hover:text-white hover:underline min-h-9 inline-flex items-center px-2">
                {t('geo.play.coords.toggle', 'Place pin by coordinates')}
            </summary>
            <form
                onSubmit={submit}
                className="mt-2 flex flex-wrap items-end justify-center gap-2"
                aria-label={t(
                    'geo.play.coords.formLabel',
                    'Place a pin using x/y coordinates',
                )}
            >
                <label className="flex flex-col items-start gap-1 text-white/80">
                    <span>{t('geo.play.coords.x', 'X (%)')}</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        step={1}
                        value={x}
                        onChange={(e) => setX(e.target.value)}
                        disabled={disabled}
                        required
                        className="w-20 rounded border border-white/20 bg-black/40 px-2 py-2 text-center text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
                    />
                </label>
                <label className="flex flex-col items-start gap-1 text-white/80">
                    <span>{t('geo.play.coords.y', 'Y (%)')}</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        step={1}
                        value={y}
                        onChange={(e) => setY(e.target.value)}
                        disabled={disabled}
                        required
                        className="w-20 rounded border border-white/20 bg-black/40 px-2 py-2 text-center text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
                    />
                </label>
                <Button
                    type="submit"
                    variant="outline"
                    className="min-h-11"
                    disabled={disabled || x === '' || y === ''}
                >
                    {t('geo.play.coords.place', 'Place pin')}
                </Button>
            </form>
            <p className="mt-1 text-[11px] text-white/50 max-w-xs mx-auto text-center">
                {t(
                    'geo.play.coords.hint',
                    '0% is the top-left corner of the map, 100% is the bottom-right.',
                )}
            </p>
        </details>
    )
}

