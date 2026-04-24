import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '@/lib/auth-client'
import { useGeoStore } from '@/stores/geoStore'
import { connectGeoSocket } from '@/lib/geo-socket'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HandCoins, Loader2, Lock, SkipForward } from 'lucide-react'

export default function GeoContributePage() {
    const { t } = useTranslation()
    const { data: session } = useSession()
    const [searchParams] = useSearchParams()
    const gameIdParam = searchParams.get('gameId')
    const gameId = gameIdParam ? Number(gameIdParam) : 1

    const {
        phase,
        currentCandidate,
        currentCandidateMap,
        pendingPin,
        errorMessage,
        pickContribution,
        setPendingPin,
        submitPin,
        recentRewards,
        contributor,
        loadContributor,
    } = useGeoStore()

    const [message, setMessage] = useState<string | null>(null)

    useEffect(() => {
        connectGeoSocket(session?.user?.id)
    }, [session?.user?.id])

    useEffect(() => {
        loadContributor()
    }, [loadContributor])

    const unlock = contributor?.unlock
    const isLocked = !!unlock && !unlock.unlocked

    useEffect(() => {
        // Avoid the guaranteed-to-fail pick call when the user is locked —
        // it would just return a 403 and blank the page into an error state.
        if (!unlock) return
        if (unlock.unlocked) pickContribution(gameId)
    }, [gameId, pickContribution, unlock])

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
                <h1 className="text-3xl font-bold tracking-tight bg-linear-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent">
                    {t('geo.contribute.title', 'Tag a screenshot')}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {t(
                        'geo.contribute.subtitle',
                        'Help the community by pinning where this scene happens. Accurate pins earn hint tokens.',
                    )}
                </p>
            </header>

            {isLocked && (
                <Card>
                    <CardContent className="py-10 text-center space-y-3">
                        <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
                        <p className="text-sm">
                            {t(
                                'geo.contribute.lockedTitle',
                                'Tagging unlocks after a few daily games.',
                            )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {t('geo.contribute.lockedProgress', 'Progress')}: {unlock?.daysPlayed}/
                            {unlock?.minRequired}{' '}
                            {t('geo.profile.unlockDays', 'days played')}
                        </p>
                    </CardContent>
                </Card>
            )}

            {!isLocked && phase === 'loading' && (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-neon-pink" />
                </div>
            )}

            {!isLocked && phase === 'error' && (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-destructive">
                        {errorMessage ?? t('common.error', 'Error')}
                    </CardContent>
                </Card>
            )}

            {!isLocked && currentCandidate && currentCandidateMap && phase === 'playing' && (
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
                            <GeoMapCanvas
                                imageUrl={currentCandidateMap.imageUrl}
                                widthPx={currentCandidateMap.widthPx}
                                heightPx={currentCandidateMap.heightPx}
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
                                    className="bg-linear-to-r from-neon-purple to-neon-pink hover:opacity-90"
                                >
                                    {t('geo.contribute.submit', 'Submit pin')}
                                </Button>
                            </div>
                            {message && (
                                <p className="text-xs text-success">{message}</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {recentRewards.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <HandCoins className="h-4 w-4 text-success" />
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
