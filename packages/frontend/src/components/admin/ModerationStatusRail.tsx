import { useTranslation } from 'react-i18next'
import {
    AlertTriangle,
    Compass,
    ListChecks,
    Loader2,
    Map,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { GeoHealth } from '@/hooks/useGeoHealth'
import type { GeoRunStatePayload } from '@/hooks/useGeoRunPolling'

// One status surface for the moderation tab. Sections in priority order:
//   1. Counter row — always visible when health is loaded.
//   2. Cold-start guidance if `curated === 0` or `withMap === 0`.
//   3. Compact run-state row appears when a manual ingestion run is in
//      flight, regardless of the section above.
//
// Data is owned by the parent so all sections agree without duplicate
// polls (`useGeoHealth` + `useGeoRunPolling` are subscribed once).

interface ModerationStatusRailProps {
    health: GeoHealth | null
    healthLoading: boolean
    healthError: boolean
    runState: GeoRunStatePayload | null
    onMapsClick?: () => void
    onPinsClick?: () => void
    // Cold-start CTAs — the empty-state copy used to point at the Jeux tab
    // in prose only, leaving the moderator to scan the tab list. The parent
    // wires these so the button deep-links straight to the right surface.
    onActivateGames?: () => void
    onGoToAcquisition?: () => void
}

interface HealthFailureRow {
    gameId?: number
    source?: string
    reason?: string
    attempt?: number
}

export function ModerationStatusRail({
    health,
    healthLoading,
    healthError,
    runState,
    onMapsClick,
    onPinsClick,
    onActivateGames,
    onGoToAcquisition,
}: ModerationStatusRailProps) {
    const { t } = useTranslation()

    if (healthLoading && !health) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t('admin.geo.strip.loading')}
            </div>
        )
    }

    if (healthError || !health) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="size-3.5" />
                {t('admin.geo.strip.error')}
            </div>
        )
    }

    // On a brand-new instance every counter is 0/0 and the row is just
    // noise — three zeros pretending to be data. Hide the counters until
    // there's something to count; the cold-start row carries the message
    // in that state. The Stripe Dashboard does the same with its "Today"
    // metrics row before the first payment.
    const errorsCount = health.queue.failed + (health.failures?.length ?? 0)
    const pinsToReview = health.queue.waiting + health.queue.active
    const allZeros =
        health.coverage.curated === 0 &&
        health.coverage.withMap === 0 &&
        pinsToReview === 0 &&
        errorsCount === 0

    return (
        <div className="rounded-md border border-border/40 bg-muted/10">
            {!allZeros && (
                <CounterRow
                    health={health}
                    onMapsClick={onMapsClick}
                    onPinsClick={onPinsClick}
                />
            )}
            <ColdStartRow
                health={health}
                onActivateGames={onActivateGames}
                onGoToAcquisition={onGoToAcquisition}
            />
            <RunStateRow state={runState} />
        </div>
    )
}

function CounterRow({
    health,
    onMapsClick,
    onPinsClick,
}: {
    health: GeoHealth
    onMapsClick?: () => void
    onPinsClick?: () => void
}) {
    const { t } = useTranslation()
    const { coverage, queue } = health
    const errorsCount = queue.failed + (health.failures?.length ?? 0)
    const pinsToReview = queue.waiting + queue.active
    const failures = (health.failures as HealthFailureRow[] | undefined) ?? []

    return (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
            <Counter
                icon={<Map className="size-3.5" aria-hidden />}
                value={`${coverage.withMap} / ${coverage.curated}`}
                label={t('admin.geo.strip.maps')}
                tone={
                    coverage.withMap === coverage.curated && coverage.curated > 0
                        ? 'good'
                        : 'neutral'
                }
                onClick={onMapsClick}
                ariaLabel={t('admin.geo.strip.mapsAria')}
            />
            <Divider />
            <Counter
                icon={<ListChecks className="size-3.5" aria-hidden />}
                value={pinsToReview}
                label={t('admin.geo.strip.pins')}
                tone={pinsToReview > 0 ? 'warn' : 'neutral'}
                onClick={onPinsClick}
                ariaLabel={t('admin.geo.strip.pinsAria')}
            />
            <Divider />
            <ErrorsCounter
                count={errorsCount}
                failures={failures}
                queueFailed={queue.failed}
            />
        </div>
    )
}

function ColdStartRow({
    health,
    onActivateGames,
    onGoToAcquisition,
}: {
    health: GeoHealth
    onActivateGames?: () => void
    onGoToAcquisition?: () => void
}) {
    const { t } = useTranslation()
    const { curated, withMap } = health.coverage

    if (curated > 0 && withMap > 0) return null

    const stage: 'no-curated' | 'no-maps' = curated === 0 ? 'no-curated' : 'no-maps'
    const ctaHandler = stage === 'no-curated' ? onActivateGames : onGoToAcquisition
    return (
        <Section role="note" tone="accent">
            <Compass className="size-4 text-neon-pink shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1 leading-relaxed flex-1">
                <p className="font-semibold text-foreground">
                    {t(`admin.geo.coldStart.${stage}.title`)}
                </p>
                <p className="text-muted-foreground">
                    {t(`admin.geo.coldStart.${stage}.body`)}
                </p>
            </div>
            {ctaHandler && (
                <button
                    type="button"
                    onClick={ctaHandler}
                    className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 rounded-md border border-neon-pink/40 bg-neon-pink/10 px-3 py-1.5 text-xs font-semibold text-neon-pink hover:bg-neon-pink/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neon-pink"
                >
                    {t(`admin.geo.coldStart.${stage}.cta`)}
                </button>
            )}
        </Section>
    )
}

function RunStateRow({ state }: { state: GeoRunStatePayload | null }) {
    const { t } = useTranslation()
    if (!state || !state.isActive) return null
    const { active, waiting, delayed, failed } = state.counts
    return (
        <div
            className="flex flex-wrap items-center gap-2 border-t border-neon-pink/20 bg-neon-pink/5 px-3 py-1.5 text-[11px]"
            role="status"
            aria-live="polite"
        >
            <span className="inline-flex items-center gap-1 text-neon-pink">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                {t('admin.geo.run.banner.active', { count: active })}
            </span>
            <span className="text-muted-foreground">
                · {t('admin.geo.run.banner.waiting', { count: waiting + delayed })}
            </span>
            {failed > 0 && (
                <span className="text-destructive">
                    · {t('admin.geo.run.banner.failed', { count: failed })}
                </span>
            )}
        </div>
    )
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'success' | 'accent'

function toneTextClass(tone: Tone): string {
    if (tone === 'good' || tone === 'success') return 'text-success'
    if (tone === 'warn') return 'text-warning'
    if (tone === 'bad') return 'text-destructive'
    return 'text-foreground'
}

function sectionToneClass(tone: 'success' | 'warn' | 'accent'): string {
    if (tone === 'success') return 'border-success/30 bg-success/5'
    if (tone === 'warn') return 'border-warning/30 bg-warning/5'
    return 'border-neon-pink/20 bg-linear-to-r from-neon-pink/5 via-neon-purple/5 to-transparent'
}

function Section({
    tone,
    role,
    children,
}: {
    tone: 'success' | 'warn' | 'accent'
    role?: 'status' | 'note'
    children: React.ReactNode
}) {
    return (
        <div
            role={role}
            aria-live={role === 'status' ? 'polite' : undefined}
            className={`flex flex-col sm:flex-row sm:items-center gap-3 border-t px-3 py-2.5 text-xs ${sectionToneClass(tone)}`}
        >
            {children}
        </div>
    )
}

function Counter({
    icon,
    value,
    label,
    tone,
    onClick,
    ariaLabel,
}: {
    icon: React.ReactNode
    value: string | number
    label: string
    tone: Tone
    onClick?: () => void
    ariaLabel?: string
}) {
    const valueClass = toneTextClass(tone)
    const body = (
        <>
            <span className={valueClass}>{icon}</span>
            <span className={`font-semibold tabular-nums ${valueClass}`}>{value}</span>
            <span className="text-muted-foreground">{label}</span>
        </>
    )
    if (!onClick) {
        return <span className="inline-flex items-center gap-1.5">{body}</span>
    }
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neon-pink"
        >
            {body}
        </button>
    )
}

function ErrorsCounter({
    count,
    failures,
    queueFailed,
}: {
    count: number
    failures: HealthFailureRow[]
    queueFailed: number
}) {
    const { t } = useTranslation()
    const tone: Tone = count > 0 ? 'bad' : 'good'
    const valueClass = toneTextClass(tone)
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={t('admin.geo.strip.errorsAria')}
                    className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neon-pink"
                >
                    <span className={valueClass}>
                        <AlertTriangle className="size-3.5" aria-hidden />
                    </span>
                    <span className={`font-semibold tabular-nums ${valueClass}`}>
                        {count}
                    </span>
                    <span className="text-muted-foreground">
                        {t('admin.geo.strip.errors')}
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 text-xs">
                <p className="text-sm font-semibold">
                    {t('admin.geo.strip.errorsPopover.title')}
                </p>
                <p className="mt-1 text-muted-foreground">
                    {t('admin.geo.strip.errorsPopover.summary', {
                        queue: queueFailed,
                        failures: failures.length,
                    })}
                </p>
                {failures.length === 0 ? (
                    <p className="mt-3 text-muted-foreground">
                        {t('admin.geo.strip.errorsPopover.empty')}
                    </p>
                ) : (
                    <ul className="mt-3 space-y-1.5 max-h-60 overflow-auto pr-1">
                        {failures.slice(0, 12).map((f, i) => (
                            <li
                                key={i}
                                className="rounded border border-border/40 bg-muted/20 px-2 py-1.5"
                            >
                                {t('admin.geo.health.failures.row', {
                                    gameId: f.gameId ?? '?',
                                    source: f.source ?? '?',
                                    reason: f.reason ?? '?',
                                    attempt: f.attempt ?? '?',
                                })}
                            </li>
                        ))}
                    </ul>
                )}
            </PopoverContent>
        </Popover>
    )
}

function Divider() {
    return <span className="h-3 w-px bg-border/60" aria-hidden />
}
