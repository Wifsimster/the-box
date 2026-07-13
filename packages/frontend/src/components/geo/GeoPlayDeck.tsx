import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { GeoPoint } from '@the-box/types'
import { RUN_LENGTH, useGeoFreePlayStore } from '@/stores/geoFreePlayStore'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { ImmersiveLayout } from '@/components/geo/ImmersiveLayout'
import { FullscreenToggle } from '@/components/geo/FullscreenToggle'
import { GamePicker } from '@/components/geo/GamePicker'
import { MapPicker } from '@/components/geo/MapPicker'
import { RunRecap } from '@/components/geo/RunRecap'
import {
    ScreenshotPanel,
    MapChunkLoader,
    MapPlaceholder,
    PinHintChip,
    ResultSheet,
    ContextHeader,
    Dock,
} from '@/components/geo/GeoPlaySlots'

// Defer the Leaflet bundle (~150KB gz 47KB) until the player has actually
// chosen a game + map. Cold visitors land on the empty/auth state and
// shouldn't pay tile/marker code on first paint.
const GeoMapCanvas = lazy(() =>
    import('@/components/geo/GeoMapCanvas').then((m) => ({ default: m.GeoMapCanvas })),
)

type Store = ReturnType<typeof useGeoFreePlayStore.getState>

export interface GeoFullscreenState {
    isImmersive: boolean
    isSupported: boolean
    onToggle: () => void
}

export interface GeoPlayDeckProps {
    fullscreen: GeoFullscreenState
    gamePickerOpen: boolean
    setGamePickerOpen: (open: boolean) => void
    mapPickerOpen: boolean
    setMapPickerOpen: (open: boolean) => void
    pinAnnouncement: string
    pinsToday: number | null
    language: string
    currentGame: Store['games'][number] | null
    selectedMap: Store['maps'][number] | null
    isMultiMap: boolean
    allGamesCompleted: boolean
    ignoredSet: Set<number>
    canSubmit: boolean
    onMapPin: (p: GeoPoint | null) => void
    onSubmit: () => void
    store: Store
}

/**
 * The immersive play deck: screenshot ↔ map with a sticky action dock.
 * Split out of GeoPlayPage so the page component stays focused on store
 * wiring and boot effects while this file owns the layout slots.
 */
export function GeoPlayDeck({
    fullscreen,
    gamePickerOpen,
    setGamePickerOpen,
    mapPickerOpen,
    setMapPickerOpen,
    pinAnnouncement,
    pinsToday,
    language,
    currentGame,
    selectedMap,
    isMultiMap,
    allGamesCompleted,
    ignoredSet,
    canSubmit,
    onMapPin,
    onSubmit,
    store,
}: GeoPlayDeckProps) {
    const { t } = useTranslation()
    const { isImmersive, isSupported: isFullscreenSupported, onToggle: onToggleFullscreen } = fullscreen
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
        hasEverPlacedPin,
        previousBestScore,
        run,
        history: roundHistory,
        historyIndex,
        selectGame,
        selectMap,
        rerollScreenshot,
        pickRandomAcrossGames,
        goPrevious,
        goNext,
        nextRound,
        startRun,
        endRun,
        checkForNewScreenshots,
        toggleIgnoreGame,
    } = store

    // Slots feed `ImmersiveLayout`; memoized so a re-render that doesn't touch
    // their inputs hands the layout a stable element reference.
    const topRightSlot: ReactNode = useMemo(
        () => (
            <>
                <Link
                    to={localizedPath('/')}
                    aria-label={t('common.home', 'Home')}
                    title={t('common.home', 'Home')}
                    className="inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white shadow-lg backdrop-blur hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <Home className="size-5" aria-hidden />
                </Link>
                <FullscreenToggle
                    isImmersive={isImmersive}
                    onToggle={onToggleFullscreen}
                    isNativeSupported={isFullscreenSupported}
                />
            </>
        ),
        [localizedPath, t, isImmersive, onToggleFullscreen, isFullscreenSupported],
    )

    const screenshotSlot: ReactNode = useMemo(
        () => (
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
                language={language}
                canIgnoreCurrent={
                    phase === 'exhausted' && currentGameId != null && !ignoredSet.has(currentGameId)
                }
                errorMessage={phase === 'error' ? errorMessage : null}
                onPickGame={() => setGamePickerOpen(true)}
                onQuickPlay={() => void pickRandomAcrossGames()}
                onStartRun={() => void startRun()}
                onCheckForNew={() => void checkForNewScreenshots()}
                onIgnoreCurrent={() => {
                    if (currentGameId != null) {
                        toggleIgnoreGame(currentGameId)
                        setGamePickerOpen(true)
                    }
                }}
            />
        ),
        [
            view,
            currentGame,
            phase,
            currentGameId,
            allGamesCompleted,
            localizedPath,
            pinsToday,
            language,
            ignoredSet,
            errorMessage,
            setGamePickerOpen,
            pickRandomAcrossGames,
            startRun,
            checkForNewScreenshots,
            toggleIgnoreGame,
        ],
    )

    const mapSlot: ReactNode = useMemo(
        () =>
            selectedMap ? (
                <>
                    <Suspense fallback={<MapChunkLoader />}>
                        <GeoMapCanvas
                            imageUrl={selectedMap.imageUrl}
                            widthPx={selectedMap.widthPx}
                            heightPx={selectedMap.heightPx}
                            tiles={selectedMap.tiles}
                            pin={pendingGuess ?? result?.guess ?? null}
                            canonical={
                                phase === 'revealed' && correctMap && selectedMap.id === correctMap.id
                                    ? result?.canonical ?? null
                                    : null
                            }
                            disabled={phase !== 'ready'}
                            onPin={onMapPin}
                            showGuessLine={
                                phase === 'revealed' && !!correctMap && selectedMap.id === correctMap.id
                            }
                            className="!rounded-none h-full"
                        />
                    </Suspense>
                    {/* First-run onboarding: the tap-the-map gesture has no
                        visible affordance of its own, so point at it until
                        the player's first-ever draft pin. */}
                    {phase === 'ready' && !pendingGuess && !hasEverPlacedPin && (
                        <PinHintChip />
                    )}
                </>
            ) : (
                <MapPlaceholder
                    hasGame={currentGameId != null}
                    multiMap={isMultiMap}
                    onPickMap={() => setMapPickerOpen(true)}
                />
            ),
        [
            selectedMap,
            pendingGuess,
            result,
            phase,
            correctMap,
            onMapPin,
            currentGameId,
            isMultiMap,
            setMapPickerOpen,
            hasEverPlacedPin,
        ],
    )

    const runActive = run != null
    const runComplete = run != null && run.scores.length >= RUN_LENGTH

    // Full-deck takeover: with no game selected the split layout has
    // nothing to split (the map panel would only say "pick a game
    // first"), and the auth wall deserves the whole stage rather than
    // the top third. In both cases the screenshot slot already renders
    // the right state screen — hand it to the layout's hero slot and
    // drop the dock (the state screens carry their own CTAs).
    const showHero = currentGameId == null || phase === 'authRequired'

    const bottomDockSlot: ReactNode = useMemo(
        () => (
            <Dock
                onShuffleAllGames={() => void pickRandomAcrossGames()}
                onPrevious={goPrevious}
                onNext={() => void goNext()}
                canGoPrevious={historyIndex > 0}
                canGoNext={historyIndex < roundHistory.length - 1 || currentGameId != null}
                onSubmit={onSubmit}
                onNextRound={() => void nextRound()}
                // During a run, skip re-rolls across the whole catalog —
                // the run owns game selection, so a same-game re-roll
                // would fight it.
                onSkip={() =>
                    void (runActive ? pickRandomAcrossGames() : rerollScreenshot())
                }
                onClearPin={() => onMapPin(null)}
                onStartRun={() => void startRun()}
                onPlaceByCoords={onMapPin}
                canSubmit={canSubmit}
                runActive={runActive}
                runComplete={runComplete}
                phase={phase}
            />
        ),
        [
            pickRandomAcrossGames,
            goPrevious,
            goNext,
            historyIndex,
            roundHistory.length,
            currentGameId,
            onSubmit,
            nextRound,
            rerollScreenshot,
            onMapPin,
            startRun,
            canSubmit,
            runActive,
            runComplete,
            phase,
        ],
    )

    const playedCountByGame = useMemo(
        () =>
            Object.fromEntries(
                Object.entries(playedByGame).map(([id, ids]) => [id, ids.length]),
            ),
        [playedByGame],
    )

    return (
        <>
            {/* Visually hidden live region for the pin-placement
                announcement. Lives at the top of the page so AT
                cursors don't have to scrub down to find the result. */}
            <output aria-live="polite" className="sr-only block">
                {pinAnnouncement}
            </output>
            <ImmersiveLayout
                isImmersive={isImmersive}
                mapInert={gamePickerOpen || mapPickerOpen}
                roundKey={`${currentGameId ?? 'none'}-${round}`}
                topRight={topRightSlot}
                hero={showHero ? screenshotSlot : undefined}
                screenshot={screenshotSlot}
                map={mapSlot}
                resultOverlay={
                    phase === 'revealed' && result ? (
                        <ResultSheet
                            score={result.score}
                            distance={result.distance}
                            wrongMap={!!result.wrongMap}
                            pinCount={result.pinCount}
                            language={language}
                            correctMapLabel={correctMap?.region ?? null}
                            previousBest={previousBestScore}
                            runTotal={
                                run
                                    ? run.scores.reduce((sum, s) => sum + s, 0)
                                    : null
                            }
                        />
                    ) : null
                }
                topBar={
                    // The welcome/auth hero carries its own entry points —
                    // context chips on top of it would just duplicate them.
                    showHero ? null : (
                    <ContextHeader
                        gameLabel={currentGame?.name ?? null}
                        mapLabel={selectedMap?.region ?? null}
                        showMapButton={isMultiMap || currentGameId == null}
                        playedCount={
                            currentGameId != null
                                ? playedByGame[currentGameId]?.length ?? 0
                                : null
                        }
                        totalCount={currentGame?.screenshotCount ?? null}
                        language={language}
                        run={
                            run
                                ? {
                                      current: Math.min(
                                          run.roundIndex + 1,
                                          RUN_LENGTH,
                                      ),
                                      total: RUN_LENGTH,
                                  }
                                : null
                        }
                        onChangeGame={() => setGamePickerOpen(true)}
                        onChangeMap={() => setMapPickerOpen(true)}
                        onEndRun={endRun}
                    />
                    )
                }
                bottomDock={showHero ? null : bottomDockSlot}
            />

            {run?.finished && (
                <RunRecap
                    scores={run.scores}
                    language={language}
                    onNewRun={() => void startRun()}
                    onClose={endRun}
                />
            )}

            <GamePicker
                open={gamePickerOpen}
                onOpenChange={setGamePickerOpen}
                games={games}
                isLoading={gamesFetchedAt == null && games.length === 0}
                selectedGameId={currentGameId}
                playedCountByGame={playedCountByGame}
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
        </>
    )
}
