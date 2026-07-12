import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Share2, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCountUp } from '@/hooks/useCountUp'
import { geoScoreTier } from '@/lib/geo-score-tiers'
import { RUN_LENGTH } from '@/stores/geoFreePlayStore'
import { cn } from '@/lib/utils'

const TIER_TEXT_CLASS = {
    high: 'text-score-high',
    mid: 'text-score-mid',
    low: 'text-score-low',
} as const

const TIER_BG_CLASS = {
    high: 'bg-score-high',
    mid: 'bg-score-mid',
    low: 'bg-score-low',
} as const

// Per-round max from the scoring curve (docs/geo-mode.md).
const ROUND_MAX = 2000

/**
 * End-of-run recap: total count-up colored by the run's average tier,
 * one tier dot per round, and share / replay / back-to-browse actions.
 * Sharing is client-only (Web Share API with a clipboard fallback) —
 * an OG-image unfurl variant is a follow-up, not part of this slice.
 */
export function RunRecap({
    scores,
    language,
    onNewRun,
    onClose,
}: {
    scores: number[]
    language: string
    onNewRun: () => void
    onClose: () => void
}) {
    const { t } = useTranslation()
    const total = scores.reduce((sum, s) => sum + s, 0)
    const max = RUN_LENGTH * ROUND_MAX
    const tier = geoScoreTier(total / Math.max(1, scores.length))
    const animatedTotal = useCountUp(total, 700)
    const [copied, setCopied] = useState(false)

    // Basic dialog behavior: focus lands on the primary action, Escape
    // closes back to free browse.
    const primaryRef = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        primaryRef.current?.focus()
    }, [])
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const share = async () => {
        const text = t('geo.play.run.shareText', {
            defaultValue:
                'I scored {{score}}/{{max}} in a {{rounds}}-round Geo run on The Box! {{url}}',
            score: total.toLocaleString(language),
            max: max.toLocaleString(language),
            rounds: scores.length,
            url: window.location.origin,
        })
        try {
            if (navigator.share) {
                await navigator.share({ text })
                return
            }
            await navigator.clipboard.writeText(text)
            setCopied(true)
        } catch {
            /* user cancelled the share sheet — nothing to do */
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="geo-run-recap-title"
        >
            <div
                className="w-full max-w-sm rounded-2xl border border-neon-cyan/40 bg-card p-6 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300"
            >
                <div className="mx-auto mb-3 w-fit rounded-full bg-neon-cyan/10 p-3">
                    <Zap className="size-6 text-neon-cyan" aria-hidden />
                </div>
                <h2 id="geo-run-recap-title" className="text-lg font-semibold">
                    {t('geo.play.run.recapTitle', 'Run complete!')}
                </h2>

                {/* Static sentence for AT; the count-up below is aria-hidden. */}
                <p className="sr-only">
                    {t('geo.play.run.recapAria', {
                        defaultValue: 'Total score {{score}} out of {{max}}',
                        score: total.toLocaleString(language),
                        max: max.toLocaleString(language),
                    })}
                </p>
                <p aria-hidden className="mt-2">
                    <span
                        className={cn(
                            'text-4xl font-bold tabular-nums',
                            TIER_TEXT_CLASS[tier],
                        )}
                    >
                        {animatedTotal.toLocaleString(language)}
                    </span>
                    <span className="ml-1.5 text-sm text-muted-foreground">
                        / {max.toLocaleString(language)}
                    </span>
                </p>

                {/* One dot per round, colored by that round's tier. */}
                <ul className="mt-4 flex items-center justify-center gap-3">
                    {scores.map((score, i) => (
                        <li
                            key={i}
                            className="flex flex-col items-center gap-1"
                            aria-label={t('geo.play.run.roundAria', {
                                defaultValue: 'Round {{round}}: {{score}} points',
                                round: i + 1,
                                score: score.toLocaleString(language),
                            })}
                        >
                            <span
                                className={cn(
                                    'size-3 rounded-full',
                                    TIER_BG_CLASS[geoScoreTier(score)],
                                )}
                                aria-hidden
                            />
                            <span
                                className="text-[10px] tabular-nums text-muted-foreground"
                                aria-hidden
                            >
                                {score.toLocaleString(language)}
                            </span>
                        </li>
                    ))}
                </ul>

                <div className="mt-6 flex flex-col gap-2">
                    <Button
                        ref={primaryRef}
                        type="button"
                        onClick={onNewRun}
                        className="gradient-gaming hover:opacity-90 min-h-12 w-full"
                    >
                        <Zap className="size-4 mr-2" aria-hidden />
                        {t('geo.play.run.again', 'New run')}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={share}
                        className="min-h-12 w-full"
                        aria-live="polite"
                    >
                        {copied ? (
                            <>
                                <Check className="size-4 mr-2" aria-hidden />
                                {t('geo.play.run.copied', 'Copied!')}
                            </>
                        ) : (
                            <>
                                <Share2 className="size-4 mr-2" aria-hidden />
                                {t('geo.play.run.share', 'Share')}
                            </>
                        )}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        className="min-h-11 w-full text-white/80 hover:text-white"
                    >
                        <X className="size-4 mr-2" aria-hidden />
                        {t('geo.play.run.close', 'Back to free play')}
                    </Button>
                </div>
            </div>
        </div>
    )
}
