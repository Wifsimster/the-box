import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/auth-client'
import { useGeoStore } from '@/stores/geoStore'
import { connectGeoSocket } from '@/lib/geo-socket'
import { MapCanvas } from '@/components/geo/MapCanvas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, MapPin, Trophy } from 'lucide-react'

function todayIso(): string {
    return new Date().toISOString().slice(0, 10)
}

export default function GeoDailyPage() {
    const { t } = useTranslation()
    const { data: session } = useSession()
    const {
        phase,
        challenge,
        meta,
        hasGuessed,
        pendingGuess,
        result,
        errorMessage,
        loadDaily,
        setPendingGuess,
        submitGuess,
    } = useGeoStore()

    const date = useMemo(todayIso, [])
    const startedAt = useRef<number>(Date.now())

    useEffect(() => {
        loadDaily(date)
    }, [date, loadDaily])

    useEffect(() => {
        connectGeoSocket(session?.user?.id)
    }, [session?.user?.id])

    const canSubmit = phase === 'playing' && !!pendingGuess && !hasGuessed

    const handleSubmit = async () => {
        const duration = Date.now() - startedAt.current
        await submitGuess(duration)
    }

    return (
        <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
            <header className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">
                    {t('geo.daily.title', 'Daily Geo Challenge')}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {t(
                        'geo.daily.subtitle',
                        'Pin the exact spot on the map where this screenshot was taken.',
                    )}
                </p>
            </header>

            {phase === 'loading' && (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" />
                </div>
            )}

            {phase === 'error' && (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-destructive">
                        {errorMessage ?? t('common.error', 'Error')}
                    </CardContent>
                </Card>
            )}

            {challenge && meta && (phase === 'playing' || phase === 'submitting' || phase === 'result') && (
                <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">
                                {t('geo.daily.screenshot', 'Screenshot')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ScreenshotFrame
                                metaImageUrl={inferScreenshotImage(meta)}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-fuchsia-500" />
                                {t('geo.daily.map', 'Map')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <MapCanvas
                                imageUrl={inferMapImage(meta)}
                                widthPx={1600}
                                heightPx={900}
                                pin={pendingGuess ?? result?.guess ?? null}
                                canonical={result?.canonical ?? null}
                                disabled={hasGuessed || phase === 'submitting' || phase === 'result'}
                                onPin={setPendingGuess}
                                showGuessLine={phase === 'result'}
                            />

                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                    {pendingGuess
                                        ? `(${pendingGuess.x.toFixed(3)}, ${pendingGuess.y.toFixed(3)})`
                                        : t('geo.daily.hint', 'Click the map to drop a pin')}
                                </span>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                    className="bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:opacity-90"
                                >
                                    {phase === 'submitting' && (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    )}
                                    {t('geo.daily.submit', 'Submit guess')}
                                </Button>
                            </div>

                            {result && <ResultBlock result={result} />}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}

function ResultBlock({
    result,
}: {
    result: NonNullable<ReturnType<typeof useGeoStore.getState>['result']>
}) {
    return (
        <div className="rounded-lg border bg-card/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-fuchsia-400 font-medium">
                <Trophy className="h-4 w-4" />
                <span>Score: {result.score.toLocaleString()}</span>
            </div>
            <div className="text-xs text-muted-foreground">
                Distance: {(result.distance * 100).toFixed(1)}% · Formula v{result.scoreVersion}
            </div>
        </div>
    )
}

// The panorama screenshot URL isn't exposed on the GeoScreenshotMeta type
// yet (it lives on the candidate). For MVP we infer from a conventional
// location or fall back to a placeholder; a follow-up can expand the API
// to return the full candidate payload alongside meta.
function inferScreenshotImage(meta: { id: number }): string {
    return `/api/geo/screenshot/${meta.id}/image`
}

function inferMapImage(meta: { geoMapId: number }): string {
    return `/api/geo/map/${meta.geoMapId}/image`
}

function ScreenshotFrame({ metaImageUrl }: { metaImageUrl: string }) {
    const [errored, setErrored] = useState(false)
    if (errored) {
        return (
            <div className="aspect-video w-full rounded-lg border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">
                Screenshot preview unavailable.
            </div>
        )
    }
    return (
        <img
            src={metaImageUrl}
            alt="Game screenshot"
            className="w-full rounded-lg border"
            onError={() => setErrored(true)}
        />
    )
}
