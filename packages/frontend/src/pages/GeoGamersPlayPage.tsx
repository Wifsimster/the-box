import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ChevronDown, Map, MapPin, RefreshCw, Sparkles, Trophy, Users } from 'lucide-react'
import { useGeoGamersStore } from '@/stores/geoGamersStore'
import { useAuth } from '@/hooks/useAuth'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { MapPicker } from '@/components/geo/MapPicker'
import { ScreenshotPip } from '@/components/geo/ScreenshotPip'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'
import type { GeoMap, GeoMapOption } from '@the-box/types'

// GeoMapOption is a structural subset of GeoMap; MapPicker wants GeoMap[] but
// only reads id/region/imageUrl/size, so widen safely for the picker.
function asGeoMaps(options: GeoMapOption[]): GeoMap[] {
    return options as unknown as GeoMap[]
}

export default function GeoGamersPlayPage() {
    const { t } = useTranslation()
    const { isAuthenticated, user } = useAuth()
    const isMobile = useIsMobile()
    const isRealAccount = isAuthenticated && !user?.isAnonymous

    const {
        phase,
        run,
        errorMessage,
        guessText,
        lastCorrect,
        lastProximity,
        selectedMapId,
        pendingPin,
        result,
        claimed,
        start,
        setGuessText,
        submitGameGuess,
        selectMap,
        setPendingPin,
        submitLocation,
        useJoker: applyJoker,
        reset,
    } = useGeoGamersStore()

    const [mapPickerOpen, setMapPickerOpen] = useState(false)

    const startedRef = useRef(false)
    useEffect(() => {
        if (!startedRef.current) {
            startedRef.current = true
            void start()
        }
    }, [start])

    const selectedMap = useMemo(
        () => run?.maps?.find((m) => m.id === selectedMapId) ?? run?.maps?.[0] ?? null,
        [run?.maps, selectedMapId],
    )

    const mapPickerNeeded = (run?.maps?.length ?? 0) > 1

    if (phase === 'loading' || phase === 'idle') {
        return (
            <output
                className="mx-auto block max-w-2xl space-y-4 px-4 py-6 sm:px-6 sm:py-8"
                aria-busy="true"
            >
                <Skeleton className="h-9 w-40" />
                <Skeleton className="aspect-video w-full rounded-xl" />
                <Skeleton variant="text" className="w-1/2" />
                <Skeleton className="h-11 w-full" />
                <span className="sr-only">{t('common.loading')}</span>
            </output>
        )
    }

    if (phase === 'error') {
        return (
            <div
                role="alert"
                className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center"
            >
                <AlertTriangle className="size-8 text-destructive" aria-hidden />
                <p className="text-sm text-muted-foreground sm:text-base">
                    {errorMessage ?? t('geogamers.error')}
                </p>
                <Button size="lg" className="w-full sm:w-auto" onClick={() => void start()}>
                    <RefreshCw aria-hidden />
                    {t('geogamers.retry')}
                </Button>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
            <header className="mb-4 flex items-center justify-between gap-2">
                <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
                    <MapPin className="size-6 text-neon-purple" aria-hidden />
                    GeoGamers
                </h1>
                <nav className="flex items-center gap-1">
                    <Button asChild variant="ghost" className="px-3 text-neon-purple">
                        <Link to="party" aria-label={t('geogamersParty.title')}>
                            <Users aria-hidden />
                            <span className="hidden sm:inline">{t('geogamersParty.title')}</span>
                        </Link>
                    </Button>
                    <Button asChild variant="ghost" className="px-3 text-neon-purple">
                        <Link to="../leaderboard">
                            <Trophy aria-hidden />
                            {t('geogamers.season.link')}
                        </Link>
                    </Button>
                </nav>
            </header>

            {/* ---------------- IDENTIFY ---------------- */}
            {phase === 'identify' && run && (
                <section>
                    <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
                        <img
                            src={run.screenshotUrl}
                            alt={t('geogamers.identify.screenshotAlt')}
                            className="max-h-[50dvh] w-full object-contain"
                        />
                    </div>

                    <label
                        htmlFor="geogamers-guess"
                        className="mb-2 block text-sm font-medium sm:text-base"
                    >
                        {t('geogamers.identify.prompt')}
                    </label>

                    {/* attempt dots */}
                    <div className="mb-3 flex items-center gap-2">
                        {[100, 66, 33].map((pts, i) => (
                            <span
                                key={pts}
                                className={cn(
                                    'flex h-7 items-center justify-center rounded-full px-2.5 text-xs font-semibold tabular-nums',
                                    i < run.attemptsUsed
                                        ? 'bg-muted text-muted-foreground line-through'
                                        : 'bg-primary/20 text-neon-purple',
                                )}
                            >
                                {pts}
                            </span>
                        ))}
                        <span className="text-xs text-muted-foreground">
                            {t('geogamers.identify.attemptsLeft', {
                                count: run.attemptsMax - run.attemptsUsed,
                            })}
                        </span>
                    </div>

                    <p aria-live="polite" className="mb-2 text-sm text-warning empty:hidden">
                        {lastCorrect === false &&
                            (lastProximity === 'very_close'
                                ? t('geogamers.identify.proximity.very_close')
                                : lastProximity === 'close'
                                  ? t('geogamers.identify.proximity.close')
                                  : t('geogamers.identify.proximity.far'))}
                    </p>

                    <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                            e.preventDefault()
                            void submitGameGuess()
                        }}
                    >
                        <Input
                            id="geogamers-guess"
                            autoFocus={!isMobile}
                            value={guessText}
                            onChange={(e) => setGuessText(e.target.value)}
                            placeholder={t('geogamers.identify.placeholder')}
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            enterKeyHint="send"
                            className="flex-1"
                        />
                        <Button type="submit" variant="gaming" disabled={!guessText.trim()}>
                            {t('geogamers.identify.submit')}
                        </Button>
                    </form>

                    {/* joker */}
                    <div className="mt-4">
                        {run.jokerAvailable ? (
                            <Button
                                variant="outline"
                                onClick={() => void applyJoker()}
                                className="border-neon-pink/50 text-neon-pink"
                            >
                                <Sparkles aria-hidden /> {t('geogamers.joker.cta')}
                            </Button>
                        ) : !isRealAccount ? (
                            <p className="text-xs text-muted-foreground">
                                {t('geogamers.joker.guestHint')}
                            </p>
                        ) : null}
                    </div>
                </section>
            )}

            {/* ---------------- LOCATE ---------------- */}
            {phase === 'locate' && run && selectedMap && (
                <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/15 px-4 py-2">
                        <p className="min-w-0 flex-1 text-center sm:text-left">
                            <span className="text-sm text-muted-foreground">
                                {t('geogamers.locate.banner')}{' '}
                            </span>
                            <span className="font-semibold text-neon-purple">
                                {run.game?.name}
                            </span>
                        </p>
                        {mapPickerNeeded && (
                            <button
                                type="button"
                                onClick={() => setMapPickerOpen(true)}
                                aria-label={t('geogamers.locate.changeMap')}
                                title={t('geogamers.locate.changeMap')}
                                className="mx-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-neon-pink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink sm:mx-0"
                            >
                                <Map className="size-3.5 text-neon-purple" aria-hidden />
                                <span className="max-w-40 truncate">
                                    {selectedMap.region ??
                                        t('geo.daily.chooseMap.worldFallback', 'World map')}
                                </span>
                                <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
                            </button>
                        )}
                    </div>

                    {/* Map + floating capture: the screenshot stays in view as
                        a picture-in-picture card while the player pins, instead
                        of vanishing when the map appears. */}
                    <div className="relative">
                        <GeoMapCanvas
                            imageUrl={selectedMap.imageUrl}
                            widthPx={selectedMap.widthPx}
                            heightPx={selectedMap.heightPx}
                            tiles={selectedMap.tiles}
                            pin={pendingPin}
                            onPin={setPendingPin}
                        />
                        <ScreenshotPip
                            imageUrl={run.screenshotUrl}
                            alt={t('geogamers.identify.screenshotAlt')}
                        />
                    </div>

                    <div className="sticky bottom-[var(--bottom-nav-space)] z-10 -mx-4 mt-4 bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                        <Button
                            size="lg"
                            variant="gaming"
                            className="w-full"
                            disabled={!pendingPin}
                            onClick={() => void submitLocation()}
                        >
                            {pendingPin ? (
                                <>
                                    <Check aria-hidden />
                                    {t('geogamers.locate.confirm')}
                                </>
                            ) : (
                                <>
                                    <MapPin aria-hidden />
                                    {t('geo.play.hint.tapMap')}
                                </>
                            )}
                        </Button>
                    </div>

                    {mapPickerNeeded && (
                        <MapPicker
                            open={mapPickerOpen}
                            onOpenChange={setMapPickerOpen}
                            maps={asGeoMaps(run.maps ?? [])}
                            selectedMapId={selectedMapId}
                            onSelect={(id) => selectMap(id ?? run.maps![0]!.id)}
                        />
                    )}
                </section>
            )}

            {/* ---------------- RESULT ---------------- */}
            {phase === 'result' && run && result && selectedMap && (
                <section>
                    <Card variant="neon" className="mb-4 text-center">
                        <CardContent className="pt-(--card-padding)">
                            <p className="text-sm text-muted-foreground">{run.game?.name}</p>
                            <p className="my-2 text-4xl font-bold tabular-nums text-neon-purple">
                                {result.totalPoints}
                                <span className="text-lg text-muted-foreground"> / 200</span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {t('geogamers.result.breakdown', {
                                    game: result.gamePoints,
                                    location: result.locationPoints,
                                })}
                            </p>

                            {isRealAccount && result.rank != null && (
                                <p className="mt-3 text-sm text-neon-purple">
                                    {t('geogamers.result.rank', { rank: result.rank })}
                                </p>
                            )}

                            {!isRealAccount && result.ghostRank != null && (
                                <div className="mt-4 rounded-lg bg-primary/15 p-3">
                                    <p className="mb-2 text-sm text-neon-purple">
                                        {t('geogamers.result.ghostRank', { rank: result.ghostRank })}
                                    </p>
                                    {claimed ? (
                                        <p className="text-sm text-success">
                                            {t('geogamers.result.claimed')}
                                        </p>
                                    ) : (
                                        <Button asChild variant="gaming" className="w-full sm:w-auto">
                                            <Link to="../register">{t('geogamers.result.claimCta')}</Link>
                                        </Button>
                                    )}
                                </div>
                            )}

                            <p className="mt-4 text-xs text-muted-foreground">
                                {isRealAccount
                                    ? t('geogamers.result.comeBack')
                                    : t('geogamers.result.unranked')}
                            </p>
                        </CardContent>
                    </Card>

                    <div className="relative">
                        <GeoMapCanvas
                            imageUrl={selectedMap.imageUrl}
                            widthPx={selectedMap.widthPx}
                            heightPx={selectedMap.heightPx}
                            tiles={selectedMap.tiles}
                            pin={result.guess}
                            canonical={result.canonical}
                            showGuessLine
                            disabled
                        />
                        <ScreenshotPip
                            imageUrl={run.screenshotUrl}
                            alt={t('geogamers.identify.screenshotAlt')}
                        />
                    </div>

                    <Button variant="outline" size="lg" className="mt-4 w-full" onClick={reset}>
                        {t('geogamers.result.done')}
                    </Button>
                </section>
            )}
        </div>
    )
}
