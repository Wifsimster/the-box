import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Loader2, MapPin, Sparkles, Trophy } from 'lucide-react'
import { useGeoGamersStore } from '@/stores/geoGamersStore'
import { useAuth } from '@/hooks/useAuth'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { MapPicker } from '@/components/geo/MapPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-neon-purple" />
            </div>
        )
    }

    if (phase === 'error') {
        return (
            <div className="mx-auto max-w-md py-16 text-center">
                <p className="mb-4 text-destructive">{errorMessage ?? t('geogamers.error')}</p>
                <Button onClick={() => void start()}>{t('geogamers.retry')}</Button>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-3xl px-4 py-6">
            <header className="mb-4 flex items-center justify-between">
                <h1 className="flex items-center gap-2 text-2xl font-bold">
                    <MapPin className="h-6 w-6 text-neon-purple" />
                    GeoGamers
                </h1>
                <Link
                    to="../leaderboard"
                    className="flex items-center gap-1 text-sm text-neon-purple hover:text-primary"
                >
                    <Trophy className="h-4 w-4" /> {t('geogamers.season.link')}
                </Link>
            </header>

            {/* ---------------- IDENTIFY ---------------- */}
            {phase === 'identify' && run && (
                <section>
                    <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
                        <img
                            src={run.screenshotUrl}
                            alt={t('geogamers.identify.screenshotAlt')}
                            className="max-h-[55vh] w-full object-contain"
                        />
                    </div>

                    <p className="mb-2 text-sm text-muted-foreground">
                        {t('geogamers.identify.prompt')}
                    </p>

                    {/* attempt dots */}
                    <div className="mb-3 flex items-center gap-2">
                        {[100, 66, 33].map((pts, i) => (
                            <span
                                key={pts}
                                className={cn(
                                    'flex h-7 items-center justify-center rounded-full px-2 text-xs font-semibold',
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

                    {lastCorrect === false && (
                        <p className="mb-2 text-sm text-warning">
                            {lastProximity === 'very_close'
                                ? t('geogamers.identify.proximity.very_close')
                                : lastProximity === 'close'
                                  ? t('geogamers.identify.proximity.close')
                                  : t('geogamers.identify.proximity.far')}
                        </p>
                    )}

                    <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                            e.preventDefault()
                            void submitGameGuess()
                        }}
                    >
                        <Input
                            autoFocus
                            value={guessText}
                            onChange={(e) => setGuessText(e.target.value)}
                            placeholder={t('geogamers.identify.placeholder')}
                            className="flex-1"
                        />
                        <Button type="submit" disabled={!guessText.trim()}>
                            {t('geogamers.identify.submit')}
                        </Button>
                    </form>

                    {/* joker */}
                    <div className="mt-4">
                        {run.jokerAvailable ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void applyJoker()}
                                className="gap-1 border-neon-pink/50 text-neon-pink"
                            >
                                <Sparkles className="h-4 w-4" /> {t('geogamers.joker.cta')}
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
                    <div className="mb-3 rounded-lg bg-primary/15 px-4 py-2 text-center">
                        <span className="text-sm text-muted-foreground">
                            {t('geogamers.locate.banner')}{' '}
                        </span>
                        <span className="font-semibold text-neon-purple">{run.game?.name}</span>
                    </div>

                    {mapPickerNeeded && (
                        <div className="mb-3">
                            <MapPicker
                                open={false}
                                onOpenChange={() => {}}
                                maps={asGeoMaps(run.maps ?? [])}
                                selectedMapId={selectedMapId}
                                onSelect={(id) => selectMap(id ?? run.maps![0]!.id)}
                            />
                        </div>
                    )}

                    <GeoMapCanvas
                        imageUrl={selectedMap.imageUrl}
                        widthPx={selectedMap.widthPx}
                        heightPx={selectedMap.heightPx}
                        tiles={selectedMap.tiles}
                        pin={pendingPin}
                        onPin={setPendingPin}
                    />

                    <Button
                        className="mt-4 w-full"
                        disabled={!pendingPin}
                        onClick={() => void submitLocation()}
                    >
                        {t('geogamers.locate.confirm')}
                    </Button>
                </section>
            )}

            {/* ---------------- RESULT ---------------- */}
            {phase === 'result' && run && result && selectedMap && (
                <section>
                    <div className="mb-4">
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
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 text-center">
                        <p className="text-sm text-muted-foreground">{run.game?.name}</p>
                        <p className="my-2 text-3xl font-bold text-neon-purple">
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
                                    <Button asChild size="sm">
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
                    </div>

                    <Button variant="ghost" className="mt-4 w-full" onClick={reset}>
                        {t('geogamers.result.done')}
                    </Button>
                </section>
            )}
        </div>
    )
}
