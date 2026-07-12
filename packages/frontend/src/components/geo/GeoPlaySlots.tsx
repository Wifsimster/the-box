import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
    TransformComponent,
    TransformWrapper,
    useControls,
} from 'react-zoom-pan-pinch'
import type { GeoPoint } from '@the-box/types'
import {
    AlertTriangle,
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
    SkipForward,
    Sparkles,
    Trophy,
    X,
    Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { StatePanel } from '@/components/geo/StatePanel'
import { useGeoFreePlayStore } from '@/stores/geoFreePlayStore'
import { useCountUp } from '@/hooks/useCountUp'
import { isPlaceholderImageUrl } from '@/lib/geo-image'
import { geoScoreTier } from '@/lib/geo-score-tiers'
import { cn } from '@/lib/utils'

export function ScreenshotPanel({
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
            <StatePanel
                icon={<Sparkles className="size-8 text-neon-pink" aria-hidden />}
                title={t('geo.play.allDone.title', "You've completed The Box!")}
                body={t(
                    'geo.play.allDone.body',
                    "Bravo! You've guessed every screenshot in every game in your catalog. We'll ping you when new ones are added.",
                )}
                actions={
                    <Button onClick={onCheckForNew} variant="outline">
                        <RefreshCw className="size-4 mr-2" aria-hidden />
                        {t('geo.play.exhausted.checkForNew', 'Check for new screenshots')}
                    </Button>
                }
            />
        )
    }

    if (exhausted) {
        return (
            <StatePanel
                icon={<Trophy className="size-8 text-neon-pink" aria-hidden />}
                title={t('geo.play.exhausted.title', "You've seen every screenshot")}
                body={t(
                    'geo.play.exhausted.body',
                    "Nice run! You've guessed every available screenshot for this game. We'll let you know when new ones are added.",
                )}
                bodyMaxWidthClass="max-w-xs"
                actions={
                    <>
                        <Button onClick={onPickGame} className="gradient-gaming hover:opacity-90">
                            <Gamepad2 className="size-4 mr-2" aria-hidden />
                            {t('geo.play.exhausted.pickAnother', 'Pick another game')}
                        </Button>
                        <Button onClick={onCheckForNew} variant="outline">
                            <RefreshCw className="size-4 mr-2" aria-hidden />
                            {t('geo.play.exhausted.checkForNew', 'Check for new screenshots')}
                        </Button>
                    </>
                }
                footnote={
                    canIgnoreCurrent ? (
                        <button
                            type="button"
                            onClick={onIgnoreCurrent}
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                        >
                            <EyeOff className="size-3.5" aria-hidden />
                            {t(
                                'geo.play.exhausted.markIgnored',
                                "I don't want to see this game again",
                            )}
                        </button>
                    ) : undefined
                }
            />
        )
    }

    if (authRequired) {
        return (
            <StatePanel
                icon={<MapPin className="size-8 text-neon-pink" aria-hidden />}
                title={t('geo.play.auth.title', 'Sign in to drop pins')}
                body={t(
                    'geo.play.auth.body',
                    'Help us map the world of video games — drop a pin where each scene takes place.',
                )}
                // When a round was already on screen (e.g. the session
                // expired mid-play), keep its screenshot visible behind a
                // blur — the game itself is the strongest signup nudge.
                backdropUrl={safeUrl}
                actions={
                    <>
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
                    </>
                }
            />
        )
    }

    if (errorMessage) {
        return (
            <StatePanel
                role="alert"
                icon={<AlertTriangle className="size-8 text-destructive" aria-hidden />}
                title={t('common.error', 'Error')}
                body={errorMessage}
            />
        )
    }

    if (empty) {
        return (
            <StatePanel
                icon={<MapPin className="size-8 text-neon-pink" aria-hidden />}
                title={t('geo.play.empty.title', 'Help us map the world of video games')}
                body={t(
                    'geo.play.empty.body',
                    'Look at a screenshot, then drop a pin where the scene takes place on the game world map. Every pin grows a shared atlas that powers future location-guessing modes.',
                )}
                bodyMaxWidthClass="max-w-md space-y-2"
                actions={
                    <Button onClick={onPickGame} className="gradient-gaming hover:opacity-90 min-h-12">
                        <Gamepad2 className="size-4 mr-2" aria-hidden />
                        {t('geo.play.empty.cta', 'Pick a game')}
                    </Button>
                }
            >
                {/* Cold-start social proof: only render once we have a
                    real number from the server, and only when there's
                    actually been activity today (>0). A "0 pins today"
                    chip would do the opposite of social proof. */}
                {pinsToday != null && pinsToday > 0 && (
                    <p
                        className="inline-flex items-center gap-1.5 rounded-full bg-neon-pink/10 px-3 py-1 text-xs text-white/90"
                        aria-live="polite"
                    >
                        <Sparkles className="size-3 text-neon-pink" aria-hidden />
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
            </StatePanel>
        )
    }

    if (loading || !safeUrl) {
        return (
            <output
                className="flex size-full items-center justify-center"
                aria-busy="true"
            >
                <Loader2 className="size-8 animate-spin text-neon-pink" aria-hidden />
                <span className="sr-only">{t('common.loading', 'Loading…')}</span>
            </output>
        )
    }

    const altText = gameName
        ? t('geo.daily.screenshotOf', 'Screenshot from {{game}}', { game: gameName })
        : t('geo.daily.screenshot', 'Screenshot')
    return <ZoomablePhoto src={safeUrl} alt={altText} />
}

/**
 * Wraps a screenshot in a pinch/wheel/double-tap zoomable surface.
 * Keyed on `src` so each new screenshot resets the transform — saves
 * us from imperative `resetTransform()` calls on every round change.
 */
function ZoomablePhoto({ src, alt }: { src: string; alt: string }) {
    // Tracked via the library's onTransformed callback rather than a
    // hook lookup — useTransformContext doesn't expose `transformState`
    // in the public type, and reading it via `as any` would defeat
    // strict typing. A scale state in the parent is cheap (one render
    // per zoom transition) and works across library versions.
    const [scale, setScale] = useState(1)
    return (
        <TransformWrapper
            key={src}
            initialScale={1}
            minScale={1}
            maxScale={5}
            centerOnInit
            doubleClick={{ mode: 'toggle', step: 1.5 }}
            wheel={{ step: 0.2 }}
            pinch={{ step: 5 }}
            // Disable pan inertia so the photo stops the moment the
            // finger lifts — keeps the photo predictable on a tiny
            // mobile viewport. Pan itself stays enabled at all scales
            // so a player who zooms in by accident can still drag.
            panning={{ disabled: false, velocityDisabled: true }}
            onTransform={(ref) => setScale(ref.state.scale)}
        >
            {scale > 1.01 && <ResetZoomButton />}
            <TransformComponent
                wrapperClass="!size-full"
                contentClass="!size-full"
            >
                <img
                    src={src}
                    alt={alt}
                    className="size-full object-contain select-none"
                    draggable={false}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                />
            </TransformComponent>
        </TransformWrapper>
    )
}

/**
 * Reset-zoom affordance. Mounted only when the photo is zoomed (the
 * parent gates it), so this component can assume a useControls call is
 * meaningful — at scale=1 it would have nothing to do.
 */
function ResetZoomButton() {
    const { t } = useTranslation()
    const { resetTransform } = useControls()
    return (
        <button
            type="button"
            onClick={() => resetTransform()}
            className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white shadow backdrop-blur min-h-9 hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
            aria-label={t('geo.play.resetZoom', 'Reset zoom')}
        >
            <RefreshCw className="size-3" aria-hidden />
            {t('geo.play.resetZoom', 'Reset zoom')}
        </button>
    )
}

export function MapChunkLoader() {
    const { t } = useTranslation()
    return (
        <output
            className="flex size-full items-center justify-center"
            aria-busy="true"
        >
            <Loader2 className="size-8 animate-spin text-neon-pink" aria-hidden />
            <span className="sr-only">{t('common.loading', 'Loading…')}</span>
        </output>
    )
}

export function MapPlaceholder({
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
        <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center">
            <MapIcon className="size-8 text-muted-foreground" aria-hidden />
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
                    <MapIcon className="size-4 mr-2" aria-hidden />
                    {t('geo.play.pickMap', 'Pick a map')}
                </Button>
            )}
        </div>
    )
}

const TIER_TEXT_CLASS = {
    high: 'text-score-high',
    mid: 'text-score-mid',
    low: 'text-score-low',
} as const

/**
 * Round-end reveal sheet. The score counts up in its tier color
 * (bands in lib/geo-score-tiers.ts), distance reads as "x% from the
 * target", and a personal-best line gives the round context beyond a
 * bare number. Screen readers get one static sentence via the sr-only
 * span — the animated markup is aria-hidden so the count-up can't spam
 * the live region.
 */
export function ResultSheet({
    score,
    distance,
    wrongMap,
    pinCount,
    language,
    correctMapLabel,
    previousBest,
    runTotal,
}: {
    score: number
    distance: number
    wrongMap: boolean
    pinCount: number
    language: string
    correctMapLabel: string | null
    previousBest: number | null
    // Cumulative run score including this round, or null in free browse.
    // Takes the personal-best line's slot — during a run the session
    // total is the context that matters.
    runTotal: number | null
}) {
    const { t } = useTranslation()
    const tier = geoScoreTier(score)
    const animated = useCountUp(score, 500)
    const distancePct = (distance * 100).toLocaleString(language, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    })
    // A floored wrong-map score is a fail state, not an achievement —
    // never celebrate it as a personal best (the store still records it).
    const isNewBest = !wrongMap && (previousBest == null || score > previousBest)
    return (
        <output
            aria-live="polite"
            aria-atomic="true"
            className={cn(
                'block mx-auto max-w-md rounded-2xl border bg-black/80 px-4 py-3.5 backdrop-blur',
                'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300',
                wrongMap
                    ? 'border-destructive/60'
                    : tier === 'high'
                      ? 'border-success/50'
                      : 'border-white/15',
            )}
            style={
                !wrongMap && tier === 'high'
                    ? { boxShadow: 'var(--glow-success)' }
                    : undefined
            }
        >
            <span className="sr-only">
                {t('geo.play.result.announce', {
                    defaultValue: 'Score {{score}} — {{percent}}% from the target',
                    score: score.toLocaleString(language),
                    percent: distancePct,
                })}
            </span>
            <div aria-hidden className="text-white">
                <div className="flex items-end justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Trophy
                            className={cn('size-5', TIER_TEXT_CLASS[tier])}
                        />
                        <span
                            className={cn(
                                'text-3xl font-bold tabular-nums leading-none',
                                TIER_TEXT_CLASS[tier],
                            )}
                        >
                            {animated.toLocaleString(language)}
                        </span>
                        <span className="text-xs text-white/70">
                            {t('geo.daily.score', 'Score')}
                        </span>
                    </div>
                    <span className="text-xs text-white/70">
                        {t('geo.play.result.fromTarget', {
                            defaultValue: '{{percent}}% from the target',
                            percent: distancePct,
                        })}
                    </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-white/70">
                    <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3 text-neon-pink" />
                        {t('geo.daily.pinCount', { count: pinCount })}
                    </span>
                    {runTotal != null ? (
                        <span className="font-medium text-neon-cyan">
                            {t('geo.play.run.total', {
                                defaultValue: 'Run total: {{score}}',
                                score: runTotal.toLocaleString(language),
                            })}
                        </span>
                    ) : isNewBest ? (
                        <span className="font-medium text-score-high">
                            {t('geo.play.result.newBest', 'New personal best!')}
                        </span>
                    ) : previousBest != null ? (
                        <span>
                            {t('geo.play.result.best', {
                                defaultValue: 'Personal best: {{score}}',
                                score: previousBest.toLocaleString(language),
                            })}
                        </span>
                    ) : null}
                </div>
                {wrongMap && (
                    <p className="mt-2 text-xs text-destructive">
                        {t('geo.daily.wrongMap.banner', 'Wrong map — score floored.')}
                        {correctMapLabel && (
                            <>
                                {' '}
                                {t('geo.play.result.correctMap', {
                                    defaultValue: 'The correct map was: {{map}}',
                                    map: correctMapLabel,
                                })}
                            </>
                        )}
                    </p>
                )}
            </div>
        </output>
    )
}

/**
 * Per-game completion ring for the context header. Turns the invisible
 * march toward the "exhausted" state into a visible collection
 * mechanic — the data (playedByGame × screenshotCount) already existed
 * in the store. Counters use neon-cyan per the token contract.
 */
function ProgressRing({
    played,
    total,
    language,
}: {
    played: number
    total: number
    language: string
}) {
    const { t } = useTranslation()
    const fraction = Math.min(1, played / total)
    const r = 7
    const circumference = 2 * Math.PI * r
    return (
        <span
            role="img"
            aria-label={t('geo.play.progressAria', {
                defaultValue: '{{played}} of {{total}} screenshots played',
                played,
                total,
            })}
            className="inline-flex shrink-0 items-center gap-1.5 text-neon-cyan"
        >
            <svg viewBox="0 0 20 20" className="size-4 -rotate-90" aria-hidden>
                <circle
                    cx="10"
                    cy="10"
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeWidth="2.5"
                />
                {fraction > 0 && (
                    <circle
                        cx="10"
                        cy="10"
                        r={r}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={`${fraction * circumference} ${circumference}`}
                    />
                )}
            </svg>
            <span className="tabular-nums" aria-hidden>
                {played.toLocaleString(language)}/{total.toLocaleString(language)}
            </span>
        </span>
    )
}

export function ContextHeader({
    gameLabel,
    mapLabel,
    showMapButton,
    playedCount,
    totalCount,
    language,
    run,
    onChangeGame,
    onChangeMap,
    onEndRun,
}: {
    gameLabel: string | null
    mapLabel: string | null
    showMapButton: boolean
    playedCount: number | null
    totalCount: number | null
    language: string
    // Active run progress (1-based round). Replaces the per-game ring —
    // the game changes every round, so per-game progress is noise here.
    run: { current: number; total: number } | null
    onChangeGame: () => void
    onChangeMap: () => void
    onEndRun: () => void
}) {
    const { t } = useTranslation()
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/80">
            <button
                type="button"
                onClick={onChangeGame}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 min-h-11 px-3 py-2 hover:border-neon-pink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
            >
                <Gamepad2 className="size-3.5" aria-hidden />
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
                    <MapIcon className="size-3.5" aria-hidden />
                    <span className="max-w-[14rem] truncate" lang={mapLabel ? 'en' : undefined}>
                        {mapLabel ?? t('geo.play.changeMap', 'Choose map')}
                    </span>
                </button>
            )}
            {run ? (
                <span className="inline-flex items-center gap-0.5 rounded-full border border-neon-cyan/40 bg-black/40 pl-3 pr-1 text-neon-cyan">
                    <Zap className="size-3.5" aria-hidden />
                    <span className="ml-1 tabular-nums">
                        {t('geo.play.run.chip', {
                            defaultValue: 'Run {{current}}/{{total}}',
                            current: run.current,
                            total: run.total,
                        })}
                    </span>
                    <button
                        type="button"
                        onClick={onEndRun}
                        aria-label={t('geo.play.run.abandon', 'Abandon the run')}
                        title={t('geo.play.run.abandon', 'Abandon the run')}
                        className="inline-flex size-9 items-center justify-center rounded-full text-neon-cyan/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
                    >
                        <X className="size-3.5" aria-hidden />
                    </button>
                </span>
            ) : (
                playedCount != null &&
                totalCount != null &&
                totalCount > 0 && (
                    <ProgressRing
                        played={playedCount}
                        total={totalCount}
                        language={language}
                    />
                )
            )}
        </div>
    )
}

export function Dock({
    onShuffleAllGames,
    onPrevious,
    onNext,
    canGoPrevious,
    canGoNext,
    onSubmit,
    onNextRound,
    onSkip,
    onClearPin,
    onStartRun,
    onPlaceByCoords,
    canSubmit,
    runActive,
    runComplete,
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
    onClearPin: () => void
    onStartRun: () => void
    onPlaceByCoords: (point: GeoPoint) => void
    canSubmit: boolean
    // A scored run is in progress: history nav / shuffle / start-run
    // leave the browse row (only skip remains — the run picks the games).
    runActive: boolean
    // Every run round is scored: the reveal CTA opens the recap.
    runComplete: boolean
    phase: ReturnType<typeof useGeoFreePlayStore.getState>['phase']
}) {
    const { t } = useTranslation()
    const submitting = phase === 'submitting'
    const revealed = phase === 'revealed'
    const loading = phase === 'loading'
    // A draft pin exists (or is being submitted). The dock renders only
    // the controls valid for the current phase, in a single constant-
    // height row, so the map above never shifts.
    const hasDraft = canSubmit || submitting

    return (
        <div className="flex flex-col gap-2">
            {revealed ? (
                /* Revealed — one job: move on (or open the run recap when
                   the last run round just got scored). */
                <Button
                    type="button"
                    onClick={onNextRound}
                    className="gradient-gaming hover:opacity-90 min-h-12 w-full"
                >
                    {runComplete
                        ? t('geo.play.run.recapCta', 'See the recap')
                        : t('geo.play.next', 'Next round')}
                    <ArrowRight className="size-4 ml-2" aria-hidden />
                </Button>
            ) : hasDraft ? (
                /* Draft pin placed — confirm is the only primary action;
                   the ✕ clears the draft and returns to the browse row. */
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onClearPin}
                        disabled={submitting}
                        className="size-12 min-h-12 min-w-12 text-white/80 hover:text-white"
                        aria-label={t('geo.play.clearPin', 'Remove pin')}
                        title={t('geo.play.clearPin', 'Remove pin')}
                    >
                        <X className="size-5" aria-hidden />
                    </Button>
                    <Button
                        type="button"
                        onClick={onSubmit}
                        disabled={submitting}
                        className="gradient-gaming hover:opacity-90 min-h-12 flex-1"
                        aria-live="polite"
                    >
                        {submitting ? (
                            <Loader2 className="size-4 mr-2 animate-spin" aria-hidden />
                        ) : (
                            <Check className="size-4 mr-2" aria-hidden />
                        )}
                        {t('geo.play.confirm', 'Confirm pin')}
                    </Button>
                </div>
            ) : (
                /* Browsing — history nav, shuffle, run start and the skip
                   escape hatch. Skip is a real button (not a text link):
                   a player who'd otherwise drop a random guess pollutes
                   the contribution dataset more than a skip costs. The
                   old always-visible disabled "Drop pin" CTA is gone —
                   its job (pointing at the map) moved to PinHintChip.
                   During a run only skip survives: the run owns game
                   selection, and history nav would break its integrity. */
                <div className="flex items-center justify-center gap-1.5">
                    {!runActive && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={onPrevious}
                            className="size-12 min-h-12 min-w-12 text-white/80 hover:text-white"
                            disabled={!canGoPrevious || loading}
                            aria-label={t('geo.play.previous', 'Previous screenshot')}
                            title={t('geo.play.previous', 'Previous screenshot')}
                        >
                            <ChevronLeft className="size-5" aria-hidden />
                        </Button>
                    )}
                    {!runActive && (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onShuffleAllGames}
                            className="min-h-12 text-white/80 hover:text-white"
                            disabled={loading}
                            aria-label={t('geo.play.shuffleAllGames', 'Random game')}
                            title={t('geo.play.shuffleAllGames', 'Random game')}
                        >
                            <Shuffle className="size-4 sm:mr-1.5" aria-hidden />
                            <span className="hidden sm:inline">
                                {t('geo.play.shuffleAllGames', 'Random game')}
                            </span>
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onSkip}
                        className="min-h-12 text-white/80 hover:text-white"
                        disabled={loading}
                        aria-label={t('geo.play.skip', "I don't know — skip this one")}
                        title={t('geo.play.skip', "I don't know — skip this one")}
                    >
                        <SkipForward className="size-4 sm:mr-1.5" aria-hidden />
                        <span className="hidden sm:inline">
                            {t('geo.play.skipShort', 'Skip')}
                        </span>
                    </Button>
                    {!runActive && (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onStartRun}
                            className="min-h-12 text-neon-cyan hover:text-white"
                            disabled={loading}
                            aria-label={t('geo.play.run.start', 'Start a run')}
                            title={t('geo.play.run.start', 'Start a run')}
                        >
                            <Zap className="size-4 sm:mr-1.5" aria-hidden />
                            <span className="hidden sm:inline">
                                {t('geo.play.run.start', 'Start a run')}
                            </span>
                        </Button>
                    )}
                    {!runActive && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={onNext}
                            className="size-12 min-h-12 min-w-12 text-white/80 hover:text-white"
                            disabled={!canGoNext || loading}
                            aria-label={t('geo.play.nextScreenshot', 'Next screenshot')}
                            title={t('geo.play.nextScreenshot', 'Next screenshot')}
                        >
                            <ChevronRight className="size-5" aria-hidden />
                        </Button>
                    )}
                </div>
            )}

            {/* Non-tap pin-placement alternative for keyboard, switch
                control and screen-reader users — Leaflet's keyboard
                pan doesn't synthesize a click on Enter, so without
                this they can't drop a pin at all. Native <details>
                gives full keyboard support out of the box. Visually
                hidden until keyboard focus reaches it (skip-link
                pattern) so touch users don't pay a dock row for an
                affordance they never use. WCAG 2.1.1 (Keyboard). */}
            {!revealed && !hasDraft && (
                <CoordinateInput
                    onPlace={onPlaceByCoords}
                    disabled={loading}
                />
            )}
        </div>
    )
}

/**
 * Onboarding hint anchored to the map panel: tells first-time players
 * the core gesture is tapping the map. Rendered only until the player's
 * first-ever draft pin (persisted flag in the free-play store), and
 * purely decorative for AT — the dock CTA and the pin live region
 * already carry the state for screen readers.
 */
export function PinHintChip() {
    const { t } = useTranslation()
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center"
        >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-center text-xs font-medium text-white shadow-lg backdrop-blur">
                <MapPin className="size-3.5 shrink-0 text-neon-pink" aria-hidden />
                {t('geo.play.hint.tapMap', 'Tap the map to place your pin')}
            </span>
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
        // Skip-link pattern: sr-only until the summary receives keyboard
        // focus or the details is open, then it pops into the layout.
        // Keeps the control in DOM/tab order right after the dock row.
        <details className="self-center text-xs text-white/80 [&:not([open]):not(:focus-within)]:sr-only">
            <summary className="cursor-pointer underline-offset-4 hover:text-white hover:underline min-h-11 inline-flex items-center px-2">
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
                        className="w-20 rounded border border-white/20 bg-black/40 p-2 text-center text-base md:text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
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
                        className="w-20 rounded border border-white/20 bg-black/40 p-2 text-center text-base md:text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink"
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
            <p className="mt-1 text-[11px] text-white/75 max-w-xs mx-auto text-center">
                {t(
                    'geo.play.coords.hint',
                    '0% is the top-left corner of the map, 100% is the bottom-right.',
                )}
            </p>
        </details>
    )
}
