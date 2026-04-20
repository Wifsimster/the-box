import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useGeoStore } from '@/stores/geoStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin, ShieldCheck, Target } from 'lucide-react'
import type { GeoContributorTier } from '@the-box/types'
import { cn } from '@/lib/utils'

const TIER_GRADIENT: Record<GeoContributorTier, string> = {
    bronze: 'from-amber-600 to-amber-800',
    silver: 'from-slate-300 to-slate-500',
    gold: 'from-amber-300 to-yellow-500',
    diamond: 'from-cyan-300 to-blue-500',
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

    if (!contributor || contributor.stats.totalSubmitted === 0) {
        return <GeoCrowdsourcerPlaceholder />
    }

    const { stats, thresholds, computedTier } = contributor
    const tierShown: GeoContributorTier = computedTier ?? stats.tier
    const accuracyPct = Math.round(stats.accuracy * 100)

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-fuchsia-500" />
                    {t('geo.profile.title', 'Geo Crowdsourcer')}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                    <div
                        className={cn(
                            'h-12 w-12 rounded-full bg-gradient-to-br shadow-lg grid place-items-center',
                            TIER_GRADIENT[tierShown],
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

function GeoCrowdsourcerPlaceholder() {
    const { t } = useTranslation()
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-fuchsia-500" />
                    {t('geo.profile.title', 'Geo Crowdsourcer')}
                </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
                {t(
                    'geo.profile.placeholder',
                    'Tag screenshots to earn hint tokens and a Crowdsourcer tier.',
                )}
            </CardContent>
        </Card>
    )
}
