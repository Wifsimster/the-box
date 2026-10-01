import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Crown, Loader2, LogOut, MapPin, Users } from 'lucide-react'
import { useGeoGamersPartyStore } from '@/stores/geoGamersPartyStore'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { ScreenshotPip } from '@/components/geo/ScreenshotPip'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useIsMobile } from '@/hooks/useIsMobile'
import { toast } from '@/lib/toast'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export default function GeoGamersPartyPage() {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    const {
        view,
        code,
        error,
        connected,
        playerId,
        lastGuessCorrect,
        pendingPin,
        selectedMapId,
        connect,
        create,
        join,
        start,
        guessGame,
        setPendingPin,
        submitLocation,
        advance,
        forceReveal,
        leave,
    } = useGeoGamersPartyStore()

    const [joinCode, setJoinCode] = useState('')
    const [rounds, setRounds] = useState(5)
    const [timerSeconds, setTimerSeconds] = useState(45)
    const [guessText, setGuessText] = useState('')
    const [copied, setCopied] = useState(false)
    const [confirmLeave, setConfirmLeave] = useState(false)

    useEffect(() => {
        connect()
    }, [connect])

    // Identity comes from the server, which also issues guest ids. Reading it
    // from the auth session left a guest host unable to start their own party.
    const isHost = !!view && !!playerId && view.hostId === playerId
    const selectedMap = useMemo(
        () => view?.round?.maps?.find((m) => m.id === selectedMapId) ?? view?.round?.maps?.[0] ?? null,
        [view?.round?.maps, selectedMapId],
    )
    const roundPointsByPlayer = useMemo(
        () => new Map((view?.reveal?.pins ?? []).map((p) => [p.playerId, p.points])),
        [view?.reveal?.pins],
    )

    // ---------- No party yet: join / create ----------
    if (!view) {
        return (
            <div className="mx-auto max-w-md space-y-6 px-4 py-6 sm:py-8">
                <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
                    <Users className="size-6 shrink-0 text-neon-purple" aria-hidden />
                    {t('geogamersParty.title')}
                </h1>
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}

                {/* Join first: most players arrive with a code from the host. */}
                <Card>
                    <CardHeader>
                        <CardTitle id="party-join-title">{t('geogamersParty.join')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form
                            className="flex gap-2"
                            onSubmit={(e) => {
                                e.preventDefault()
                                if (connected && joinCode.length >= 4) join(joinCode)
                            }}
                        >
                            <Input
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                placeholder={t('geogamersParty.codePlaceholder')}
                                aria-labelledby="party-join-title"
                                maxLength={6}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="characters"
                                spellCheck={false}
                                enterKeyHint="go"
                                className="flex-1 font-mono uppercase tracking-widest"
                            />
                            <Button type="submit" disabled={!connected || joinCode.length < 4}>
                                {t('geogamersParty.joinCta')}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('geogamersParty.create')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p id="party-rounds-label" className="mb-2 text-sm text-muted-foreground">
                                {t('geogamersParty.rounds')}
                            </p>
                            <div className="flex gap-2" role="group" aria-labelledby="party-rounds-label">
                                {[3, 5, 10].map((r) => (
                                    <Button
                                        key={r}
                                        variant={rounds === r ? 'default' : 'outline'}
                                        aria-pressed={rounds === r}
                                        onClick={() => setRounds(r)}
                                        className="flex-1 tabular-nums"
                                    >
                                        {r}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* The server has validated 30/45/60 since day one; the UI
                            hardcoded 45, so the option was unreachable. */}
                        <div>
                            <p id="party-timer-label" className="mb-2 text-sm text-muted-foreground">
                                {t('geogamersParty.timer')}
                            </p>
                            <div className="flex gap-2" role="group" aria-labelledby="party-timer-label">
                                {[30, 45, 60].map((sec) => (
                                    <Button
                                        key={sec}
                                        variant={timerSeconds === sec ? 'default' : 'outline'}
                                        aria-pressed={timerSeconds === sec}
                                        onClick={() => setTimerSeconds(sec)}
                                        className="flex-1 tabular-nums"
                                    >
                                        {t('geogamersParty.seconds', { count: sec })}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <Button
                            variant="gaming"
                            size="lg"
                            className="w-full"
                            disabled={!connected}
                            onClick={() => create({ rounds, timerSeconds })}
                        >
                            {connected ? (
                                t('geogamersParty.createCta')
                            ) : (
                                <>
                                    <Loader2 className="animate-spin" aria-hidden />
                                    {t('geogamersParty.connecting')}
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // ---------- Scoreboard (shared) ----------
    const scoreboard = (
        <ol className="space-y-1">
            {view.scoreboard.map((s, i) => {
                const isYou = s.playerId === playerId
                const roundPoints = view.status === 'reveal' ? roundPointsByPlayer.get(s.playerId) : undefined
                return (
                    <li
                        key={s.playerId}
                        className={cn(
                            'flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
                            isYou ? 'bg-primary/15' : 'bg-muted/40',
                        )}
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            <span className="w-5 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
                            <span className="truncate">{s.name}</span>
                            {isYou && (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    ({t('geogamersParty.you')})
                                </span>
                            )}
                            {view.hostId === s.playerId && (
                                <Crown
                                    className="size-3.5 shrink-0 text-medal-gold"
                                    aria-label={t('geogamersParty.host')}
                                />
                            )}
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                            {roundPoints != null && (
                                <span className="text-xs text-success">
                                    {t('geogamersParty.roundPoints', { count: roundPoints })}
                                </span>
                            )}
                            <span className="font-semibold text-neon-purple">{s.total}</span>
                        </span>
                    </li>
                )
            })}
        </ol>
    )

    const inGame = view.status === 'in_round' || view.status === 'reveal'

    return (
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
            <header className="mb-4 flex items-center justify-between gap-2">
                <h1 className="flex min-w-0 items-center gap-2 text-xl font-bold sm:text-2xl">
                    <Users className="size-5 shrink-0 text-neon-purple" aria-hidden />
                    <span className="truncate">{t('geogamersParty.title')}</span>
                </h1>
                <Button
                    variant="ghost"
                    className="shrink-0 px-3"
                    onClick={() => (inGame ? setConfirmLeave(true) : leave())}
                >
                    <LogOut aria-hidden />
                    {t('geogamersParty.leave')}
                </Button>
            </header>

            <ConfirmDialog
                open={confirmLeave}
                onOpenChange={setConfirmLeave}
                title={t('geogamersParty.leaveConfirmTitle')}
                description={t('geogamersParty.leaveConfirmBody')}
                confirmLabel={t('geogamersParty.leave')}
                cancelLabel={t('common.cancel')}
                destructive
                onConfirm={() => {
                    setConfirmLeave(false)
                    leave()
                }}
            />

            {error && (
                <p role="alert" className="mb-3 text-sm text-destructive">
                    {error}
                </p>
            )}

            {/* ---------- Lobby ---------- */}
            {view.status === 'lobby' && (
                <section className="space-y-4">
                    <Card variant="neon">
                        <CardContent className="flex items-center justify-between gap-3 pt-(--card-padding)">
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground">
                                    {t('geogamersParty.inviteCode')}
                                </p>
                                <p className="font-mono text-3xl font-bold tracking-widest text-neon-purple">
                                    {code}
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label={t('geogamersParty.copyCode')}
                                title={t('geogamersParty.copyCode')}
                                onClick={async () => {
                                    // The old version flashed "copied" even when the
                                    // clipboard API was missing or the write was
                                    // refused — the invite code is the one thing
                                    // this screen exists to hand over.
                                    if (!code) return
                                    try {
                                        await navigator.clipboard.writeText(code)
                                        setCopied(true)
                                        setTimeout(() => setCopied(false), 1500)
                                    } catch {
                                        toast.error(t('share.copyError'))
                                    }
                                }}
                            >
                                {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
                            </Button>
                            <span className="sr-only" aria-live="polite">
                                {copied ? t('share.copied') : ''}
                            </span>
                        </CardContent>
                    </Card>

                    <div>
                        <p className="mb-2 text-xs text-muted-foreground">
                            {t('geogamersParty.playerCount', {
                                count: view.players.length,
                                max: view.maxPlayers,
                            })}
                        </p>
                        <ul className="space-y-1">
                            {view.players.map((p) => (
                                <li
                                    key={p.id}
                                    className={cn(
                                        'flex min-h-11 items-center gap-2 rounded-lg px-3 py-2',
                                        p.connected ? 'bg-muted/40' : 'bg-muted/20 text-muted-foreground',
                                    )}
                                >
                                    {p.isHost && (
                                        <Crown
                                            className="size-4 shrink-0 text-medal-gold"
                                            aria-label={t('geogamersParty.host')}
                                        />
                                    )}
                                    <span className="truncate">{p.name}</span>
                                    {p.id === playerId && (
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            ({t('geogamersParty.you')})
                                        </span>
                                    )}
                                    {/* Opacity alone carried this state — a colour-only
                                        signal, which ui-tokens forbids. */}
                                    {!p.connected && (
                                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                            {t('geogamersParty.disconnected')}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {isHost ? (
                        <Button variant="gaming" size="lg" className="w-full" onClick={start}>
                            {t('geogamersParty.start')}
                        </Button>
                    ) : (
                        <p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            {t('geogamersParty.waitingHost')}
                        </p>
                    )}
                </section>
            )}

            {/* ---------- In round ---------- */}
            {view.status === 'in_round' && view.round && (
                <section>
                    <p className="mb-2 text-sm font-medium text-muted-foreground tabular-nums">
                        {t('geogamersParty.round', {
                            n: view.round.index + 1,
                            total: view.totalRounds,
                        })}
                    </p>

                    {view.you?.done ? (
                        <Card>
                            <CardContent className="space-y-4 pt-(--card-padding) text-center">
                                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin text-neon-purple" aria-hidden />
                                    {t('geogamersParty.waitingOthers')}
                                </p>
                                {scoreboard}
                                {/* Only the host, and only once they're done: there is no
                                    server-side round timer, so an idle player would hold
                                    everyone here indefinitely. Closing scores the
                                    stragglers on what they had reached — which is why it
                                    isn't offered to a host who hasn't played yet. */}
                                {isHost && (
                                    <div className="space-y-2">
                                        <Button variant="outline" className="w-full" onClick={forceReveal}>
                                            {t('geogamersParty.forceReveal')}
                                        </Button>
                                        <p className="text-xs text-muted-foreground">
                                            {t('geogamersParty.forceRevealHint')}
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ) : !view.you?.resolvedPhase1 ? (
                        // identify phase
                        <div>
                            <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
                                <img
                                    src={view.round.screenshotUrl}
                                    alt={t('geogamers.identify.screenshotAlt')}
                                    className="max-h-[50dvh] w-full object-contain"
                                />
                            </div>
                            <label
                                htmlFor="party-guess"
                                className="mb-2 block text-sm font-medium sm:text-base"
                            >
                                {t('geogamers.identify.prompt')}
                            </label>
                            <p aria-live="polite" className="mb-2 text-sm text-warning empty:hidden">
                                {lastGuessCorrect === false &&
                                    t('geogamersParty.wrongGuess', {
                                        count: view.you?.attemptsLeft ?? 0,
                                    })}
                            </p>
                            <form
                                className="flex gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    if (guessText.trim()) {
                                        guessGame(guessText.trim())
                                        setGuessText('')
                                    }
                                }}
                            >
                                <Input
                                    id="party-guess"
                                    autoFocus={!isMobile}
                                    value={guessText}
                                    onChange={(e) => setGuessText(e.target.value)}
                                    placeholder={t('geogamers.identify.placeholder')}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    enterKeyHint="send"
                                    className="flex-1"
                                />
                                <Button type="submit" variant="gaming" disabled={!guessText.trim()}>
                                    {t('geogamers.identify.submit')}
                                </Button>
                            </form>
                        </div>
                    ) : selectedMap ? (
                        // locate phase
                        <div>
                            <div className="mb-3 rounded-lg bg-primary/15 px-4 py-2">
                                <p className="text-center text-sm">
                                    <span className="text-muted-foreground">
                                        {t('geogamers.locate.banner')}{' '}
                                    </span>
                                    <span className="font-semibold text-neon-purple">
                                        {view.round.gameName}
                                    </span>
                                </p>
                            </div>
                            {/* Keep the capture in view while pinning. */}
                            <div className="relative">
                                <GeoMapCanvas
                                    imageUrl={selectedMap.imageUrl}
                                    widthPx={selectedMap.widthPx}
                                    heightPx={selectedMap.heightPx}
                                    tiles={selectedMap.tiles}
                                    pin={pendingPin}
                                    onPin={setPendingPin}
                                />
                                <ScreenshotPip
                                    imageUrl={view.round.screenshotUrl}
                                    alt={t('geogamers.identify.screenshotAlt')}
                                />
                            </div>
                            <div className="sticky bottom-[var(--bottom-nav-space)] z-10 -mx-4 mt-4 bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                                <Button
                                    variant="gaming"
                                    size="lg"
                                    className="w-full"
                                    disabled={!pendingPin}
                                    onClick={submitLocation}
                                >
                                    {pendingPin ? (
                                        <>
                                            <Check aria-hidden />
                                            {t('geogamers.locate.confirm')}
                                        </>
                                    ) : (
                                        <>
                                            <MapPin aria-hidden />
                                            {t('geo.play.hint.tapMap')}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </section>
            )}

            {/* ---------- Reveal / Finished ---------- */}
            {(view.status === 'reveal' || view.status === 'finished') && (
                <section className="space-y-4">
                    {view.reveal && view.status === 'reveal' && (
                        <div className="rounded-lg bg-primary/15 px-4 py-3 text-center">
                            <span className="text-sm text-muted-foreground">
                                {t('geogamersParty.answer')}{' '}
                            </span>
                            <span className="font-semibold text-neon-purple">
                                {view.reveal.gameName}
                            </span>
                        </div>
                    )}

                    {view.status === 'finished' && (
                        <h2 className="text-center text-xl font-semibold text-neon-purple sm:text-2xl">
                            {t('geogamersParty.finished')}
                        </h2>
                    )}

                    {scoreboard}

                    {view.status === 'reveal' && isHost && (
                        <Button variant="gaming" size="lg" className="w-full" onClick={advance}>
                            {view.currentRound + 1 >= view.totalRounds
                                ? t('geogamersParty.seeResults')
                                : t('geogamersParty.nextRound')}
                        </Button>
                    )}
                    {view.status === 'reveal' && !isHost && (
                        <p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            {t('geogamersParty.waitingHost')}
                        </p>
                    )}
                    {view.status === 'finished' && (
                        <Button size="lg" className="w-full" variant="outline" onClick={leave}>
                            {t('geogamersParty.leave')}
                        </Button>
                    )}
                </section>
            )}
        </div>
    )
}
