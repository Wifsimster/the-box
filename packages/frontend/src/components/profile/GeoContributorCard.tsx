import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useGeoStore } from '@/stores/geoStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Lock, MapPin, ShieldCheck, Target } from 'lucide-react'
import type { GeoContributorTier } from '@the-box/types'
import { cn } from '@/lib/utils'

// Tier badges use medal tokens where available; diamond falls back to the
// neon-cyan scale since no medal-diamond token exists in the contract.
const TIER_BG: Record<GeoContributorTier, string> = {
    bronze: 'bg-medal-bronze',
    silver: 'bg-medal-silver',
    gold: 'bg-medal-gold',
    diamond: 'bg-neon-cyan',
}

const TIER_LABEL: Record<GeoContributorTier, string> = {
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    diamond: 'Diamond',
}

export function GeoContributorCard() {
    const { t } = useTranslation()
    const { contributor, loadContributor } = useGeoStore()

    useEffect(() => {
        loadContributor()
    }, [loadContributor])

    if (!contributor) {
        return <GeoCrowdsourcerPlaceholder />
    }

    if (contributor.stats.totalSubmitted === 0) {
        return <GeoCrowdsourcerPlaceholder unlock={contributor.unlock} />
    }

    const { stats, thresholds, computedTier, unlock } = contributor
    const tierShown: GeoContributorTier = computedTier ?? stats.tier
    const accuracyPct = Math.round(stats.accuracy * 100)

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-neon-pink" />
                    {t('geo.profile.title', 'Geo Crowdsourcer')}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                    <div
                        className={cn(
                            'h-12 w-12 rounded-full shadow-lg grid place-items-center',
                            TIER_BG[tierShown],
                        )}
                        aria-hidden
                    >
                        <ShieldCheck className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-semibold">{TIER_LABEL[tierShown]}</p>
                        <p className="text-xs text-muted-foreground">
                            {stats.totalAccepted} {t('geo.profile.accepted', 'accepted pins')} ·{' '}
                            {accuracyPct}% {t('geo.profile.accuracy', 'accuracy')}
                        </p>
                    </div>
                    {stats.shadowBanned && (
                        <Badge variant="destructive">
                            {t('geo.profile.restricted', 'Restricted')}
                        </Badge>
                    )}
                </div>

                {!unlock.unlocked && (
                    <UnlockProgress unlock={unlock} />
                )}

                <NextTierHint
                    currentTier={tierShown}
                    totalAccepted={stats.totalAccepted}
                    accuracy={stats.accuracy}
                    thresholds={thresholds}
                />
            </CardContent>
        </Card>
    )
}

function UnlockProgress({
    unlock,
}: {
    unlock: { daysPlayed: number; minRequired: number; unlocked: boolean }
}) {
    const { t } = useTranslation()
    const pct = Math.min(100, Math.round((unlock.daysPlayed / unlock.minRequired) * 100))
    return (
        <div className="rounded-lg border bg-card/40 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 text-foreground">
                <Lock className="h-3.5 w-3.5" />
                <span className="font-medium">
                    {t('geo.profile.unlockLabel', 'Contribute unlocks after')}{' '}
                    {unlock.daysPlayed}/{unlock.minRequired}{' '}
                    {t('geo.profile.unlockDays', 'days played')}
                </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full bg-linear-to-r from-neon-purple to-neon-pink transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}

function NextTierHint({
    currentTier,
    totalAccepted,
    accuracy,
    thresholds,
}: {
    currentTier: GeoContributorTier
    totalAccepted: number
    accuracy: number
    thresholds: Array<{ tier: GeoContributorTier; minAccepted: number; minAccuracy: number; displayOrder: number }>
}) {
    const { t } = useTranslation()
    const sorted = [...thresholds].sort((a, b) => a.displayOrder - b.displayOrder)
    const currentIdx = sorted.findIndex((t) => t.tier === currentTier)
    const next = currentIdx >= 0 ? sorted[currentIdx + 1] : undefined
    if (!next) return null

    const pinsNeeded = Math.max(0, next.minAccepted - totalAccepted)
    const accuracyGap = Math.max(0, next.minAccuracy - accuracy)

    return (
        <div className="rounded-lg border bg-card/40 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 mb-1 text-foreground">
                <Target className="h-3.5 w-3.5" />
                <span className="font-medium">
                    {t('geo.profile.nextTier', 'Next tier')}: {TIER_LABEL[next.tier]}
                </span>
            </div>
            <ul className="space-y-1">
                {pinsNeeded > 0 && (
                    <li>
                        {pinsNeeded} {t('geo.profile.morePins', 'more accepted pins')}
                    </li>
                )}
                {accuracyGap > 0 && (
                    <li>
                        +{Math.ceil(accuracyGap * 100)}%{' '}
                        {t('geo.profile.moreAccuracy', 'accuracy')}
                    </li>
                )}
                {pinsNeeded === 0 && accuracyGap === 0 && (
                    <li>{t('geo.profile.closeToPromotion', 'Promotion imminent!')}</li>
                )}
            </ul>
        </div>
    )
}

function GeoCrowdsourcerPlaceholder({
    unlock,
}: {
    unlock?: { daysPlayed: number; minRequired: number; unlocked: boolean }
}) {
    const { t } = useTranslation()
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-neon-pink" />
                    {t('geo.profile.title', 'Geo Crowdsourcer')}
                </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
                <p>
                    {t(
                        'geo.profile.placeholder',
                        'Tag screenshots to earn hint tokens and a Crowdsourcer tier.',
                    )}
                </p>
                {unlock && !unlock.unlocked && <UnlockProgress unlock={unlock} />}
            </CardContent>
        </Card>
    )
}
