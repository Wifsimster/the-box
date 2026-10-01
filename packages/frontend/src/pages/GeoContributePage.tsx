import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import type { GeoPinConfidence } from '@the-box/types'
import { authClient, useSession } from '@/lib/auth-client'
import { useGeoStore } from '@/stores/geoStore'
import { connectGeoSocket } from '@/lib/geo-socket'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { ScreenshotPip } from '@/components/geo/ScreenshotPip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { cn } from '@/lib/utils'
import {
    AlertTriangle,
    CheckCircle2,
    HandCoins,
    Loader2,
    Lock,
    MapPin,
    Play,
    RefreshCw,
    SkipForward,
} from 'lucide-react'

export default function GeoContributePage() {
    const { t } = useTranslation()
    const { localizedPath } = useLocalizedPath()
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

    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async () => {
        setSubmitting(true)
        const ok = await submitPin()
        setSubmitting(false)
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

    const daysPlayed = unlock?.daysPlayed ?? 0
    const minRequired = unlock?.minRequired ?? 0

    return (
        <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8 lg:px-8">
            <header className="space-y-2">
                <h1 className="gradient-gaming-title text-3xl font-bold tracking-tight sm:text-4xl">
                    {t('geo.contribute.title', 'Tag a screenshot')}
                </h1>
                <p className="text-sm text-muted-foreground sm:text-base">
                    {t(
                        'geo.contribute.subtitle',
                        'Help the community by pinning where this scene happens. Accurate pins earn hint tokens.',
                    )}
                </p>
            </header>

            {isLocked && (
                <Card>
                    <CardContent className="mx-auto max-w-sm space-y-4 py-10 text-center">
                        <Lock className="mx-auto size-8 text-muted-foreground" aria-hidden />
                        <p className="text-sm sm:text-base">
                            {t(
                                'geo.contribute.lockedTitle',
                                'Tagging unlocks after a few daily games.',
                            )}
                        </p>
                        <div className="space-y-1.5">
                            <Progress
                                value={minRequired > 0 ? Math.min(100, (daysPlayed / minRequired) * 100) : 0}
                                aria-label={t('geo.contribute.lockedProgress', 'Progress')}
                            />
                            <p className="text-xs text-muted-foreground tabular-nums">
                                {t('geo.contribute.lockedProgress', 'Progress')}: {daysPlayed}/
                                {minRequired} {t('geo.profile.unlockDays', 'days played')}
                            </p>
                        </div>
                        <Button asChild variant="gaming" className="w-full sm:w-auto">
                            <Link to={localizedPath('/play')}>
                                <Play aria-hidden />
                                {t('common.dailyGuess', 'Daily challenge')}
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {message && (
                <Card variant="success" role="status" aria-live="polite">
                    <CardContent className="flex items-center gap-3 pt-(--card-padding) text-sm">
                        <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
                        {message}
                    </CardContent>
                </Card>
            )}

            {!isLocked && phase === 'loading' && (
                <output className="grid gap-6 lg:grid-cols-2" aria-busy="true">
                    <Skeleton className="aspect-video w-full rounded-xl" />
                    <Skeleton className="aspect-square w-full rounded-xl" />
                    <span className="sr-only">
                        {t('geo.contribute.loading', 'Loading screenshot…')}
                    </span>
                </output>
            )}

            {!isLocked && phase === 'error' && (
                <Card variant="error">
                    <CardContent className="flex flex-col items-center gap-4 py-10 text-center" role="alert">
                        <AlertTriangle className="size-8 text-destructive" aria-hidden />
                        <p className="text-sm">{errorMessage ?? t('common.error', 'Error')}</p>
                        <Button variant="outline" onClick={handleSkip}>
                            <RefreshCw aria-hidden />
                            {t('common.retry', 'Retry')}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {!isLocked && currentCandidate && currentCandidateMap && phase === 'playing' && (
                <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                    <Card>
                        <CardHeader>
                            <StepTitle step={1}>
                                {t('geo.contribute.screenshot', 'Screenshot')}
                            </StepTitle>
                        </CardHeader>
                        <CardContent>
                            <img
                                src={currentCandidate.imageUrl}
                                alt={t('geo.contribute.screenshot', 'Screenshot')}
                                className="w-full rounded-lg border"
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <StepTitle step={2}>
                                {t('geo.contribute.map', 'Pin its location')}
                            </StepTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Below lg the screenshot card scrolls away while
                                pinning — keep it floating over the map. */}
                            <div className="relative">
                                <GeoMapCanvas
                                    imageUrl={currentCandidateMap.imageUrl}
                                    widthPx={currentCandidateMap.widthPx}
                                    heightPx={currentCandidateMap.heightPx}
                                    tiles={currentCandidateMap.tiles}
                                    pin={pendingPin}
                                    onPin={setPendingPin}
                                />
                                <ScreenshotPip
                                    imageUrl={currentCandidate.imageUrl}
                                    alt={t('geo.contribute.screenshot', 'Screenshot')}
                                    className="lg:hidden"
                                />
                            </div>
                            {/* Confidence chip — shown only after a pin is
                                placed so it doesn't pre-bias the player.
                                Skipping the chip is allowed; the server
                                treats unspecified as "sure" today, and a
                                follow-up will weight low-confidence pins
                                proportionally less in consensus. */}
                            {pendingPin ? (
                                <ConfidenceChips
                                    value={pendingConfidence}
                                    onChange={setPendingConfidence}
                                />
                            ) : (
                                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <MapPin className="size-4 shrink-0 text-neon-pink" aria-hidden />
                                    {t('geo.play.hint.tapMap', 'Tap the map to place your pin')}
                                </p>
                            )}
                            {errorMessage && (
                                <p role="alert" className="text-sm text-destructive">
                                    {errorMessage}
                                </p>
                            )}
                            <div className="sticky bottom-[var(--bottom-nav-space)] z-10 flex gap-2 bg-card py-3">
                                <Button
                                    variant="outline"
                                    onClick={handleSkip}
                                    disabled={submitting}
                                >
                                    <SkipForward aria-hidden />
                                    {t('geo.contribute.skip', 'Skip')}
                                </Button>
                                <Button
                                    variant="gaming"
                                    onClick={handleSubmit}
                                    disabled={!pendingPin || submitting}
                                    className="flex-1 sm:flex-none"
                                >
                                    {submitting && <Loader2 className="animate-spin" aria-hidden />}
                                    {t('geo.contribute.submit', 'Submit pin')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {recentRewards.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <HandCoins className="size-4 text-success" aria-hidden />
                            {t('geo.contribute.recent', 'Recent rewards')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            {recentRewards.slice(0, 5).map((r) => {
                                const tokens = r.items.reduce((n, it) => n + it.quantity, 0)
                                const itemsKey = r.items
                                    .map((it) => `${it.itemKey}:${it.quantity}`)
                                    .join('|')
                                return (
                                    <li
                                        key={`${r.userId}-${r.geoScreenshotCandidateId}-${itemsKey}`}
                                    >
                                        {t('geo.contribute.rewardLine', {
                                            defaultValue: '+{{count}} hint tokens',
                                            count: tokens,
                                        })}
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

function StepTitle({ step, children }: { step: number; children: ReactNode }) {
    return (
        <CardTitle className="flex items-center gap-2 text-base">
            <span
                aria-hidden
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-neon-pink/15 text-xs font-semibold text-neon-pink"
            >
                {step}
            </span>
            {children}
        </CardTitle>
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
