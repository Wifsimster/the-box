import { useTranslation } from 'react-i18next'
import {
    AlertTriangle,
    CalendarCheck,
    CalendarClock,
    Compass,
    ListChecks,
    Loader2,
    Map,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { GeoHealth } from '@/hooks/useGeoHealth'
import type { GeoRunStatePayload } from '@/hooks/useGeoRunPolling'

// One status surface for the moderation tab. Sections in priority order:
//   1. Counter row — always visible when health is loaded.
//   2. Cold-start guidance if `curated === 0` or `withMap === 0`; this
//      hides readiness (no daily challenge can exist yet).
//   3. Otherwise, daily-challenge readiness with the Planifier action.
//   4. Compact run-state row appears when a manual ingestion run is in
//      flight, regardless of the section above.
//
// Data is owned by the parent so all sections agree without duplicate
// polls (`useGeoHealth` + `useGeoRunPolling` are subscribed once).

interface ModerationStatusRailProps {
    health: GeoHealth | null
    healthLoading: boolean
    healthError: boolean
    runState: GeoRunStatePayload | null
    onSchedule: () => void
    scheduling: boolean
    onMapsClick?: () => void
    onPinsClick?: () => void
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
    onSchedule,
    scheduling,
    onMapsClick,
    onPinsClick,
}: ModerationStatusRailProps) {
    const { t } = useTranslation()

    if (healthLoading && !health) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('admin.geo.strip.loading')}
            </div>
        )
    }

    if (healthError || !health) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('admin.geo.strip.error')}
            </div>
        )
    }

    return (
        <div className="rounded-md border border-border/40 bg-muted/10">
            <CounterRow
                health={health}
                onMapsClick={onMapsClick}
                onPinsClick={onPinsClick}
            />
            <GuidanceRow
                health={health}
                scheduling={scheduling}
                onSchedule={onSchedule}
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
    const { t, i18n } = useTranslation()
    const { coverage, queue, nextChallenge } = health
    const errorsCount = queue.failed + (health.failures?.length ?? 0)
    const pinsToReview = queue.waiting + queue.active
    const failures = (health.failures as HealthFailureRow[] | undefined) ?? []

    return (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
            <Counter
                icon={<Map className="h-3.5 w-3.5" aria-hidden />}
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
                icon={<ListChecks className="h-3.5 w-3.5" aria-hidden />}
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
            {nextChallenge && (
                <>
                    <Divider />
                    <Counter
                        icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />}
                        value={new Date(nextChallenge.date).toLocaleDateString(i18n.language, {
                            day: '2-digit',
                            month: 'short',
                        })}
                        label={t('admin.geo.strip.nextChallenge')}
                        tone="neutral"
                    />
                </>
            )}
        </div>
    )
}

function GuidanceRow({
    health,
    onSchedule,
    scheduling,
}: {
    health: GeoHealth
    onSchedule: () => void
    scheduling: boolean
}) {
    const { t, i18n } = useTranslation()
    const { curated, withMap } = health.coverage

    if (curated === 0 || withMap === 0) {
        const stage: 'no-curated' | 'no-maps' = curated === 0 ? 'no-curated' : 'no-maps'
        return (
            <Section role="note" tone="accent">
                <Compass className="h-4 w-4 text-neon-pink shrink-0 mt-0.5" aria-hidden />
                <div className="space-y-1 leading-relaxed">
                    <p className="font-semibold text-foreground">
                        {t(`admin.geo.coldStart.${stage}.title`)}
                    </p>
                    <p className="text-muted-foreground">
                        {t(`admin.geo.coldStart.${stage}.body`)}
                    </p>
                </div>
            </Section>
        )
    }

    const next = health.nextChallenge
    if (next) {
        const date = new Date(next.date).toLocaleDateString(i18n.language, {
            day: '2-digit',
            month: 'long',
        })
        return (
            <Section role="status" tone="success">
                <CalendarCheck className="h-4 w-4 text-success shrink-0" aria-hidden />
                <p className="font-semibold text-foreground flex-1">
                    {t('admin.geo.readiness.ready', { date })}
                </p>
            </Section>
        )
    }

    return (
        <Section role="status" tone="warn">
            <CalendarClock className="h-4 w-4 text-warning shrink-0" aria-hidden />
            <div className="flex-1 space-y-0.5 leading-relaxed">
                <p className="font-semibold text-foreground">
                    {t('admin.geo.readiness.notReady')}
                </p>
                <p className="text-muted-foreground">
                    {t('admin.geo.readiness.notReadyHint')}
                </p>
            </div>
            <Button
                size="sm"
                onClick={onSchedule}
                disabled={scheduling}
                className="gradient-gaming hover:opacity-90 w-full sm:w-auto"
            >
                {scheduling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                    <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t('admin.geo.readiness.scheduleAction')}
            </Button>
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
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
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
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
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
