import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import type { GeoPinConfidence } from '@the-box/types'
import { authClient, useSession } from '@/lib/auth-client'
import { useGeoStore } from '@/stores/geoStore'
import { connectGeoSocket } from '@/lib/geo-socket'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { HandCoins, Loader2, Lock, SkipForward } from 'lucide-react'

export default function GeoContributePage() {
    const { t } = useTranslation()
    const { data: session, isPending: isSessionPending } = useSession()
    const [searchParams] = useSearchParams()
    const gameIdParam = searchParams.get('gameId')
    const gameId = gameIdParam ? Number(gameIdParam) : 1

    const {
        phase,
        currentCandidate,
        currentCandidateMap,
        pendingPin,
        pendingConfidence,
        errorMessage,
        pickContribution,
        setPendingPin,
        setPendingConfidence,
        submitPin,
        recentRewards,
        contributor,
        loadContributor,
    } = useGeoStore()

    const [message, setMessage] = useState<string | null>(null)
    // Anonymous bootstrap: a guest landing here has no session, so the
    // contributor + pick endpoints would 401 and the page would blank
    // out. Auto-creating a Better Auth anonymous session keeps the
    // contribute path frictionless — pins land flagged `is_anonymous`
    // server-side so consensus and admin moderation can still
    // distinguish them. The ref guards against duplicate calls in
    // React 18 strict-mode dev.
    const anonSignInTriggered = useRef(false)

    useEffect(() => {
        if (isSessionPending) return
        if (session?.user?.id) return
        if (anonSignInTriggered.current) return
        anonSignInTriggered.current = true
        ;(async () => {
            try {
                await authClient.signIn.anonymous()
            } catch {
                // Failure here just means the user stays unauthenticated
                // and the contributor/pick endpoints will surface their
                // own 401 — nothing else to do client-side.
            }
        })()
    }, [isSessionPending, session?.user?.id])

    useEffect(() => {
        connectGeoSocket(session?.user?.id)
    }, [session?.user?.id])

    useEffect(() => {
        if (!session?.user?.id) return
        loadContributor()
    }, [loadContributor, session?.user?.id])

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
                <h1 className="text-3xl font-bold tracking-tight gradient-gaming bg-clip-text text-transparent">
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
                        <Lock className="mx-auto size-8 text-muted-foreground" />
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
                <output
                    className="flex justify-center py-20"
                    aria-busy="true"
                >
                    <Loader2
                        className="size-8 animate-spin text-neon-pink"
                        aria-hidden
                    />
                    <span className="sr-only">
                        {t('geo.contribute.loading', 'Loading screenshot…')}
                    </span>
                </output>
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
                                tiles={currentCandidateMap.tiles}
                                pin={pendingPin}
                                onPin={setPendingPin}
                            />
                            {/* Confidence chip — shown only after a pin is
                                placed so it doesn't pre-bias the player.
                                Skipping the chip is allowed; the server
                                treats unspecified as "sure" today, and a
                                follow-up will weight low-confidence pins
                                proportionally less in consensus. */}
                            {pendingPin && (
                                <ConfidenceChips
                                    value={pendingConfidence}
                                    onChange={setPendingConfidence}
                                />
                            )}
                            <div className="flex items-center justify-between">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSkip}
                                >
                                    <SkipForward className="size-4 mr-2" />
                                    {t('geo.contribute.skip', 'Skip')}
                                </Button>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={!pendingPin}
                                    className="gradient-gaming hover:opacity-90"
                                >
                                    {t('geo.contribute.submit', 'Submit pin')}
                                </Button>
                            </div>
                            {message && (
                                <p
                                    className="text-xs text-success"
                                    role="status"
                                    aria-live="polite"
                                >
                                    {message}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {recentRewards.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <HandCoins className="size-4 text-success" />
                            {t('geo.contribute.recent', 'Recent rewards')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="text-xs text-muted-foreground space-y-1">
                            {recentRewards.slice(0, 5).map((r) => {
                                const tokens = r.items.reduce((n, it) => n + it.quantity, 0)
                                const itemsKey = r.items
                                    .map((it) => `${it.itemKey}:${it.quantity}`)
                                    .join('|')
                                return (
                                    <li
                                        key={`${r.userId}-${r.geoScreenshotCandidateId}-${itemsKey}`}
                                    >
                                        +{tokens} hint tokens
                                        (candidate #{r.geoScreenshotCandidateId})
                                    </li>
                                )
                            })}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

// Three buckets, each carrying its weight intent for the future
// consensus tweak. The label keys live under
// geo.contribute.confidence.* so a translator can rephrase
// "Sure / Approx / Guess" without touching code.
const CONFIDENCE_OPTIONS: Array<{ value: GeoPinConfidence; key: string; fallback: string }> = [
    { value: 1, key: 'geo.contribute.confidence.sure', fallback: 'Sure' },
    { value: 2, key: 'geo.contribute.confidence.approx', fallback: 'Approximate' },
    { value: 3, key: 'geo.contribute.confidence.guess', fallback: 'Guessing' },
]

function ConfidenceChips({
    value,
    onChange,
}: {
    value: GeoPinConfidence | null
    onChange: (c: GeoPinConfidence | null) => void
}) {
    const { t } = useTranslation()
    return (
        <div role="radiogroup" aria-label={t('geo.contribute.confidence.label', 'How confident are you?')}>
            <p className="text-xs text-muted-foreground mb-1.5">
                {t('geo.contribute.confidence.label', 'How confident are you?')}
            </p>
            <div className="flex flex-wrap gap-2">
                {CONFIDENCE_OPTIONS.map((opt) => {
                    const selected = value === opt.value
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => onChange(selected ? null : opt.value)}
                            className={cn(
                                'inline-flex items-center min-h-11 px-3 py-2 rounded-full border text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink',
                                selected
                                    ? 'border-neon-pink bg-neon-pink/15 text-foreground'
                                    : 'border-border text-muted-foreground hover:border-neon-pink/60 hover:text-foreground',
                            )}
                        >
                            {t(opt.key, opt.fallback)}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
