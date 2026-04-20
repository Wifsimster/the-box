import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '@/lib/auth-client'
import { useGeoStore } from '@/stores/geoStore'
import { connectGeoSocket } from '@/lib/geo-socket'
import { MapCanvas } from '@/components/geo/MapCanvas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, HandCoins, SkipForward } from 'lucide-react'

export default function GeoContributePage() {
    const { t } = useTranslation()
    const { data: session } = useSession()
    const [searchParams] = useSearchParams()
    const gameIdParam = searchParams.get('gameId')
    const gameId = gameIdParam ? Number(gameIdParam) : 1

    const {
        phase,
        currentCandidate,
        pendingPin,
        errorMessage,
        pickContribution,
        setPendingPin,
        submitPin,
        recentRewards,
    } = useGeoStore()

    const [message, setMessage] = useState<string | null>(null)

    useEffect(() => {
        connectGeoSocket(session?.user?.id)
    }, [session?.user?.id])

    useEffect(() => {
        pickContribution(gameId)
    }, [gameId, pickContribution])

    const handleSubmit = async () => {
        const ok = await submitPin()
        if (ok) {
            setMessage(
                t(
                    'geo.contribute.thanks',
                    "Thanks — we'll let you know once other players agree on the spot.",
                ),
            )
            // Queue up the next one.
            setTimeout(() => {
                setMessage(null)
                pickContribution(gameId)
            }, 1200)
        }
    }

    const handleSkip = () => {
        pickContribution(gameId)
    }

    return (
        <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
            <header className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">
                    {t('geo.contribute.title', 'Tag a screenshot')}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {t(
                        'geo.contribute.subtitle',
                        'Help the community by pinning where this scene happens. Accurate pins earn hint tokens.',
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

            {currentCandidate && phase === 'playing' && (
                <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">
                                {t('geo.contribute.screenshot', 'Screenshot')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <img
                                src={currentCandidate.imageUrl}
                                alt="Unlabeled game screenshot"
                                className="w-full rounded-lg border"
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">
                                {t('geo.contribute.map', 'Pin its location')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <MapCanvas
                                imageUrl={`/api/geo/map/${currentCandidate.geoMapId}/image`}
                                widthPx={1600}
                                heightPx={900}
                                pin={pendingPin}
                                onPin={setPendingPin}
                            />
                            <div className="flex items-center justify-between">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSkip}
                                >
                                    <SkipForward className="h-4 w-4 mr-2" />
                                    {t('geo.contribute.skip', 'Skip')}
                                </Button>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={!pendingPin}
                                    className="bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:opacity-90"
                                >
                                    {t('geo.contribute.submit', 'Submit pin')}
                                </Button>
                            </div>
                            {message && (
                                <p className="text-xs text-emerald-400">{message}</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {recentRewards.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <HandCoins className="h-4 w-4 text-emerald-400" />
                            {t('geo.contribute.recent', 'Recent rewards')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="text-xs text-muted-foreground space-y-1">
                            {recentRewards.slice(0, 5).map((r, i) => (
                                <li key={i}>
                                    +{r.items.reduce((n, it) => n + it.quantity, 0)} hint tokens
                                    (candidate #{r.geoScreenshotCandidateId})
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
