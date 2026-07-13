import { type ComponentType, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Gamepad2, MapPin, Play, Sparkles, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Cold-start hero for the free-play geo deck. Rendered across the FULL
 * deck (both panel slots) when no game is selected, replacing the old
 * flow that auto-opened the game picker over a blank split screen. The
 * player gets the pitch, social proof and three explicit entry points —
 * quick play (zero decisions), the catalog picker, and the scored run —
 * before any sheet is pushed in their face.
 */
export function GeoWelcome({
    pinsToday,
    language,
    runLength,
    onQuickPlay,
    onPickGame,
    onStartRun,
}: {
    pinsToday: number | null
    language: string
    runLength: number
    onQuickPlay: () => void
    onPickGame: () => void
    onStartRun: () => void
}) {
    const { t } = useTranslation()
    return (
        <div className="relative size-full overflow-y-auto">
            {/* Decorative depth — one soft radial glow, per the one-hero-
                glow-per-screen token rule (the reveal owns the glow once
                a round is running; here the welcome is the only screen). */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_0%,var(--tw-gradient-stops))] from-neon-purple/20 via-transparent to-transparent"
            />
            <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-5 px-6 py-10 text-center">
                <div className="rounded-full bg-neon-pink/10 p-4">
                    <MapPin className="size-8 text-neon-pink" aria-hidden />
                </div>
                <div className="space-y-2">
                    <h2 className="text-xl font-bold leading-tight sm:text-2xl">
                        {t('geo.play.welcome.title', 'Guess where every screenshot was taken')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {t(
                            'geo.play.welcome.body',
                            'Study the screenshot, then drop your pin on the exact spot on the game map. Every pin grows the community atlas.',
                        )}
                    </p>
                </div>

                {/* Social proof — render only once a real, non-zero number
                    landed; a "0 pins today" chip would do the opposite. */}
                {pinsToday != null && pinsToday > 0 && (
                    <p
                        className="inline-flex items-center gap-1.5 rounded-full bg-neon-pink/10 px-3 py-1 text-xs text-white/90"
                        aria-live="polite"
                    >
                        <Sparkles className="size-3 text-neon-pink" aria-hidden />
                        {t('geo.play.welcome.pinsToday', {
                            defaultValue: '{{count}} pins dropped today by the community',
                            count: pinsToday,
                            formatted: pinsToday.toLocaleString(language),
                        })}
                    </p>
                )}

                <div className="flex w-full flex-col gap-2.5">
                    <WelcomeAction
                        icon={Play}
                        title={t('geo.play.welcome.quickPlay', 'Quick play')}
                        sub={t(
                            'geo.play.welcome.quickPlaySub',
                            'A random screenshot — play right away.',
                        )}
                        onClick={onQuickPlay}
                        variant="primary"
                    />
                    <WelcomeAction
                        icon={Gamepad2}
                        title={t('geo.play.welcome.pickGame', 'Pick a game')}
                        sub={t(
                            'geo.play.welcome.pickGameSub',
                            'Browse the catalog at your own pace.',
                        )}
                        onClick={onPickGame}
                    />
                    <WelcomeAction
                        icon={Zap}
                        title={t('geo.play.welcome.startRun', 'Start a run')}
                        sub={t('geo.play.welcome.startRunSub', {
                            defaultValue: '{{count}} scored rounds, one total to share.',
                            count: runLength,
                        })}
                        onClick={onStartRun}
                        variant="run"
                    />
                </div>
            </div>
        </div>
    )
}

function WelcomeAction({
    icon: Icon,
    title,
    sub,
    onClick,
    variant = 'default',
}: {
    icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
    title: ReactNode
    sub: ReactNode
    onClick: () => void
    variant?: 'primary' | 'run' | 'default'
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'group flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                variant === 'primary' &&
                    'gradient-gaming border-transparent text-white hover:opacity-90',
                variant === 'run' &&
                    'border-neon-cyan/40 bg-card hover:border-neon-cyan/70',
                variant === 'default' &&
                    'border-border bg-card hover:border-neon-pink/60',
            )}
        >
            <span
                className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full',
                    variant === 'primary' && 'bg-white/15 text-white',
                    variant === 'run' && 'bg-neon-cyan/10 text-neon-cyan',
                    variant === 'default' && 'bg-neon-pink/10 text-neon-pink',
                )}
            >
                <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight">
                    {title}
                </span>
                <span
                    className={cn(
                        'mt-0.5 block text-xs leading-snug',
                        variant === 'primary' ? 'text-white/80' : 'text-muted-foreground',
                    )}
                >
                    {sub}
                </span>
            </span>
            <ChevronRight
                className={cn(
                    'size-4 shrink-0 transition-transform group-hover:translate-x-0.5',
                    variant === 'primary' ? 'text-white/80' : 'text-muted-foreground',
                )}
                aria-hidden
            />
        </button>
    )
}
