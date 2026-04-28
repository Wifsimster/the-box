import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/auth-client'
import { useGeoStore } from '@/stores/geoStore'
import { connectGeoSocket } from '@/lib/geo-socket'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { GeoMapChooser } from '@/components/geo/GeoMapChooser'
import { ReportCaptureDialog } from '@/components/ReportCaptureDialog'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ImageOff, Loader2, MapPin, Trophy, Hourglass, History, SkipForward, ArrowRight } from 'lucide-react'
import { isPlaceholderImageUrl } from '@/lib/geo-image'
import { Link } from 'react-router-dom'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

export default function GeoDailyPage() {
    const { t, i18n } = useTranslation()
    const { data: session } = useSession()
    const {
        phase,
        challenge,
        meta,
        candidate,
        maps,
        selectedMapId,
        correctMap,
        hasGuessed,
        pendingGuess,
        result,
        wasSkipped,
        errorMessage,
        errorCode,
        loadCurrent,
        selectMap,
        setPendingGuess,
        submitGuess,
        skipChallenge,
        loadNextUnplayed,
    } = useGeoStore()
    const selectedMap = maps.find((m) => m.id === selectedMapId) ?? null
    const isMultiMap = maps.length > 1

    // useRef's initial value runs on every render; lazy-via-useState keeps
    // Date.now() out of render while staying mount-stable.
    const [startedAt] = useState(() => Date.now())

    useEffect(() => {
        loadCurrent()
    }, [loadCurrent])

    useEffect(() => {
        connectGeoSocket(session?.user?.id)
    }, [session?.user?.id])

    // Multi-map games gate submit on having picked a map; single-map games
    // auto-select at load time so the gate becomes a no-op.
    const canSubmit =
        phase === 'playing' &&
        !!pendingGuess &&
        !hasGuessed &&
        (selectedMapId != null || maps.length === 0)
    const canSkip = phase === 'playing' && !hasGuessed

    const handleSubmit = async () => {
        const duration = Date.now() - startedAt
        await submitGuess(duration)
    }

    const handleSkip = async () => {
        await skipChallenge()
    }

    const handleNext = async () => {
        await loadNextUnplayed()
    }

    return (
        <>
            <CubeBackground />
            <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6 relative z-10">
                <header className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight gradient-gaming bg-clip-text text-transparent">
                        {t('geo.daily.title', 'Geo Challenge')}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {t(
                            'geo.daily.subtitle',
                            'Pin the exact spot on the map where this screenshot was taken.',
                        )}
                    </p>
                </header>

                {phase === 'loading' && (
                    <div
                        className="flex justify-center py-20"
                        role="status"
                        aria-live="polite"
                        aria-busy="true"
                    >
                        <Loader2 className="h-8 w-8 animate-spin text-neon-pink" aria-hidden />
                        <span className="sr-only">
                            {t('geo.daily.loading', 'Loading challenge…')}
                        </span>
                    </div>
                )}

                {phase === 'error' && errorCode === 'NO_CHALLENGE' && (
                    <NoChallengeCard />
                )}

                {phase === 'error' && errorCode === 'NO_NEXT_UNPLAYED' && (
                    <NoMoreUnplayedCard />
                )}

                {phase === 'error' &&
                    errorCode !== 'NO_CHALLENGE' &&
                    errorCode !== 'NO_NEXT_UNPLAYED' && (
                        <Card>
                            <CardContent
                                className="py-10 text-center text-sm text-destructive"
                                role="alert"
                            >
                                {errorMessage ?? t('common.error', 'Error')}
                            </CardContent>
                        </Card>
                    )}

                {challenge && meta && candidate && maps.length > 0 && (phase === 'playing' || phase === 'submitting' || phase === 'result' || phase === 'skipped') && (
                    <div className="grid gap-6 lg:grid-cols-2">
                        <Card>
                            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-base">
                                    {t('geo.daily.screenshot', 'Screenshot')}
                                </CardTitle>
                                <ReportCaptureDialog
                                    target={{ geoScreenshotCandidateId: candidate.id }}
                                    isAuthenticated={!!session?.user?.id}
                                />
                            </CardHeader>
                            <CardContent>
                                <ScreenshotFrame imageUrl={candidate.imageUrl} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-neon-pink" />
                                    {t('geo.daily.map', 'Map')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isMultiMap && (
                                    <GeoMapChooser
                                        maps={maps}
                                        selectedMapId={selectedMapId}
                                        correctMapId={correctMap?.id ?? null}
                                        disabled={hasGuessed || phase !== 'playing'}
                                        onSelect={selectMap}
                                    />
                                )}

                                {selectedMap ? (
                                    <GeoMapCanvas
                                        imageUrl={selectedMap.imageUrl}
                                        widthPx={selectedMap.widthPx}
                                        heightPx={selectedMap.heightPx}
                                        pin={pendingGuess ?? result?.guess ?? null}
                                        canonical={
                                            // Only show the canonical pin when the player picked
                                            // the right map — otherwise the dot would land on
                                            // a different map's coordinate space and look like
                                            // an off-screen bug.
                                            phase === 'result' &&
                                            correctMap &&
                                            selectedMap.id === correctMap.id
                                                ? result?.canonical ?? null
                                                : null
                                        }
                                        disabled={hasGuessed || phase === 'submitting' || phase === 'result' || phase === 'skipped'}
                                        onPin={setPendingGuess}
                                        showGuessLine={phase === 'result' && !!correctMap && selectedMap.id === correctMap.id}
                                    />
                                ) : (
                                    <div
                                        className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed bg-muted/30 px-6 text-center text-xs text-muted-foreground"
                                        role="status"
                                    >
                                        {t(
                                            'geo.daily.chooseMap.required',
                                            'Pick a map above before dropping a pin.',
                                        )}
                                    </div>
                                )}

                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        {pendingGuess
                                            ? `(${pendingGuess.x.toFixed(3)}, ${pendingGuess.y.toFixed(3)})`
                                            : t('geo.daily.hint', 'Click the map to drop a pin')}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            onClick={handleSkip}
                                            disabled={!canSkip}
                                            variant="ghost"
                                            size="sm"
                                            title={t(
                                                'geo.daily.skip.tooltip',
                                                "I don't recognize this game",
                                            )}
                                        >
                                            <SkipForward className="h-4 w-4 mr-1.5" aria-hidden />
                                            {t('geo.daily.skip.action', 'Skip')}
                                        </Button>
                                        <Button
                                            onClick={handleSubmit}
                                            disabled={!canSubmit}
                                            className="gradient-gaming hover:opacity-90"
                                        >
                                            {phase === 'submitting' && (
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            )}
                                            {t('geo.daily.submit', 'Submit guess')}
                                        </Button>
                                    </div>
                                </div>

                                {result && (
                                    <ResultBlock
                                        result={result}
                                        correctMap={correctMap}
                                        t={t}
                                        language={i18n.language}
                                    />
                                )}
                                {phase === 'skipped' && wasSkipped && <SkipResultBlock t={t} />}
                                {(phase === 'result' || phase === 'skipped') && (
                                    <Button
                                        onClick={handleNext}
                                        className="gradient-gaming hover:opacity-90 w-full"
                                    >
                                        {t('geo.daily.next.action', 'Next geo guess')}
                                        <ArrowRight className="h-4 w-4 ml-2" aria-hidden />
                                    </Button>
                                )}
                                {(phase === 'result' || phase === 'skipped') && (
                                    <p className="text-xs text-muted-foreground text-center">
                                        {t(
                                            'geo.daily.next.casualNote',
                                            "Practice round — won't affect your leaderboard rank.",
                                        )}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </>
    )
}

function SkipResultBlock({ t }: { t: ReturnType<typeof useTranslation>['t'] }) {
    return (
        <div className="rounded-lg border bg-card/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground font-medium">
                <SkipForward className="h-4 w-4" aria-hidden />
                <span>{t('geo.daily.skip.title', 'Skipped')}</span>
            </div>
            <p className="text-xs text-muted-foreground">
                {t(
                    'geo.daily.skip.body',
                    "No score recorded — this challenge won't count toward the leaderboard for you.",
                )}
            </p>
        </div>
    )
}

function ResultBlock({
    result,
    correctMap,
    t,
    language,
}: {
    result: NonNullable<ReturnType<typeof useGeoStore.getState>['result']>
    correctMap: ReturnType<typeof useGeoStore.getState>['correctMap']
    t: ReturnType<typeof useTranslation>['t']
    language: string
}) {
    const hasStats =
        typeof result.averageScore === 'number' &&
        typeof result.playerCount === 'number' &&
        result.playerCount > 0
    const correctRegion =
        correctMap?.region ?? t('geo.daily.chooseMap.worldFallback', 'World map')
    return (
        <div className="rounded-lg border bg-card/50 p-4 space-y-2">
            {result.wrongMap && (
                <div
                    className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    role="alert"
                >
                    <p className="font-medium text-destructive">
                        {t('geo.daily.wrongMap.banner', 'Wrong map — score floored.')}
                    </p>
                    {correctMap && (
                        <p className="mt-0.5">
                            {t('geo.daily.reveal.correctMap', 'Correct map: {{region}}', {
                                region: correctRegion,
                            })}
                        </p>
                    )}
                </div>
            )}
            <div className="flex items-center gap-2 text-neon-pink font-medium">
                <Trophy className="h-4 w-4" />
                <span>
                    {t('geo.daily.score', 'Score')}: {result.score.toLocaleString(language)}
                </span>
                {result.wrongMap && (
                    <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                        {t('geo.daily.wrongMap.chip', 'Wrong map')}
                    </span>
                )}
            </div>
            {hasStats && (
                <ScoreComparison
                    score={result.score}
                    averageScore={result.averageScore!}
                    playerCount={result.playerCount!}
                    t={t}
                    language={language}
                />
            )}
            <div className="text-xs text-muted-foreground">
                {t('geo.daily.distance', 'Distance')}: {(result.distance * 100).toFixed(1)}% ·{' '}
                {t('geo.daily.formula', 'Formula')} v{result.scoreVersion}
            </div>
        </div>
    )
}

function ScoreComparison({
    score,
    averageScore,
    playerCount,
    t,
    language,
}: {
    score: number
    averageScore: number
    playerCount: number
    t: ReturnType<typeof useTranslation>['t']
    language: string
}) {
    const delta = score - averageScore
    // Color the delta by how far from the average the player landed.
    // Within ±10% of the average → neutral; clearly above → green; clearly
    // below → muted red. Tuned to feel encouraging on a near-miss.
    const tolerance = Math.max(50, averageScore * 0.1)
    const tone =
        delta >= tolerance
            ? 'text-score-high'
            : delta <= -tolerance
              ? 'text-score-low'
              : 'text-muted-foreground'
    const sign = delta > 0 ? '+' : ''
    const formattedDelta = `${sign}${delta.toLocaleString(language)}`

    // Bar mapping: average sits at 50 %, the user's score is positioned
    // proportionally up to ±100 % of the average from that midpoint.
    // Clamped so extreme outliers don't blow past the bar edges.
    const ratio = averageScore > 0 ? (score - averageScore) / averageScore : 0
    const clamped = Math.max(-1, Math.min(1, ratio))
    const positionPct = 50 + clamped * 50

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                    {t('geo.daily.average', 'Average')}:{' '}
                    <span className="text-foreground font-medium">
                        {averageScore.toLocaleString(language)}
                    </span>{' '}
                    <span className="text-muted-foreground/70">
                        ({t('geo.daily.players', '{{count}} players', { count: playerCount })})
                    </span>
                </span>
                <span className={`font-medium ${tone}`}>{formattedDelta}</span>
            </div>
            <div
                className="relative h-1.5 rounded-full bg-muted/40 overflow-hidden"
                role="img"
                aria-label={t('geo.daily.comparisonAria', 'Your score vs. average')}
            >
                {/* Average tick at 50 % */}
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-muted-foreground/60" />
                {/* Player marker */}
                <div
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full border border-background ${
                        delta >= 0 ? 'bg-score-high' : 'bg-score-low'
                    }`}
                    style={{ left: `${positionPct}%` }}
                />
            </div>
        </div>
    )
}

function ScreenshotFrame({ imageUrl }: { imageUrl: string }) {
    const { t } = useTranslation()
    // Proactively flag known placeholder hosts (placehold.co etc.) — they
    // *successfully* load a real image and would otherwise sneak past the
    // onError fallback as a fake-looking screenshot.
    const [errored, setErrored] = useState(() => isPlaceholderImageUrl(imageUrl))

    useEffect(() => {
        setErrored(isPlaceholderImageUrl(imageUrl))
    }, [imageUrl])

    if (errored) {
        return (
            <div className="aspect-video w-full rounded-lg border border-dashed bg-muted/30 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <ImageOff className="h-6 w-6 opacity-60" aria-hidden />
                <span>{t('geo.daily.screenshotUnavailable', 'Screenshot preview unavailable.')}</span>
            </div>
        )
    }
    return (
        <img
            src={imageUrl}
            alt={t('geo.daily.screenshot', 'Screenshot')}
            className="w-full rounded-lg border"
            onError={() => setErrored(true)}
        />
    )
}

// Shown after a "Next geo guess" tap when the player has already
// played every challenge in the last 7 days. Rather than a destructive
// error, offer onward navigation — leaderboard for context, history
// for review.
function NoMoreUnplayedCard() {
    const { t } = useTranslation()
    const { localizedPath } = useLocalizedPath()
    return (
        <Card className="border-neon-pink/40">
            <CardContent className="py-10 text-center space-y-4">
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                    {t(
                        'geo.daily.next.exhausted',
                        "You've played every recent geo challenge. Come back tomorrow for a new one.",
                    )}
                </p>
                <div className="flex justify-center gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link to={localizedPath('/history')}>
                            <History className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                            {t('geo.daily.errors.viewHistory', 'View past challenges')}
                        </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                        <Link to={localizedPath('/geo/leaderboard')}>
                            <Trophy className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                            {t('geo.daily.next.viewLeaderboard', 'View leaderboard')}
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

// Shown when /api/geo/current returns 404 NO_CHALLENGE — i.e. no row is
// flagged `is_current`. During slow rollout this is expected between
// games (admins release manually, no midnight cron), so the copy and
// missing countdown both signal "we'll release the next one when we're
// ready" rather than "broken — try at midnight".
function NoChallengeCard() {
    const { t } = useTranslation()
    const { localizedPath } = useLocalizedPath()
    return (
        <Card className="border-neon-pink/40">
            <CardContent className="py-10 text-center space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-neon-pink/40 bg-neon-pink/5 px-3 py-1 text-xs text-neon-pink">
                    <Hourglass className="h-3.5 w-3.5" aria-hidden />
                    <span>
                        {t('geo.daily.errors.comingSoon', 'New game coming soon')}
                    </span>
                </div>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                    {t(
                        'geo.daily.errors.noChallenge',
                        "No geo game is live right now. We're rolling out new ones gradually — check back soon.",
                    )}
                </p>
                <div className="flex justify-center">
                    <Button asChild variant="outline" size="sm">
                        <Link to={localizedPath('/history')}>
                            <History className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                            {t('geo.daily.errors.viewHistory', 'View past challenges')}
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
