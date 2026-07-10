import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Users, Crown, Copy, Check } from 'lucide-react'
import { useGeoGamersPartyStore } from '@/stores/geoGamersPartyStore'
import { useAuth } from '@/hooks/useAuth'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export default function GeoGamersPartyPage() {
    const { t } = useTranslation()
    const { user } = useAuth()
    const {
        view,
        code,
        error,
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
        leave,
    } = useGeoGamersPartyStore()

    const [joinCode, setJoinCode] = useState('')
    const [rounds, setRounds] = useState(5)
    const [guessText, setGuessText] = useState('')
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        connect()
    }, [connect])

    const myId = user?.id
    const isHost = !!view && !!myId && view.hostId === myId
    const selectedMap = useMemo(
        () => view?.round?.maps?.find((m) => m.id === selectedMapId) ?? view?.round?.maps?.[0] ?? null,
        [view?.round?.maps, selectedMapId],
    )

    // ---------- No party yet: create / join ----------
    if (!view) {
        return (
            <div className="mx-auto max-w-md px-4 py-10">
                <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold">
                    <Users className="h-6 w-6 text-neon-purple" /> {t('geogamersParty.title')}
                </h1>
                {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

                <div className="mb-6 rounded-xl border border-border bg-card p-4">
                    <h2 className="mb-3 font-semibold">{t('geogamersParty.create')}</h2>
                    <label className="mb-2 block text-sm text-muted-foreground">
                        {t('geogamersParty.rounds')}
                    </label>
                    <div className="mb-4 flex gap-2">
                        {[3, 5, 10].map((r) => (
                            <Button
                                key={r}
                                variant={rounds === r ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setRounds(r)}
                            >
                                {r}
                            </Button>
                        ))}
                    </div>
                    <Button className="w-full" onClick={() => create({ rounds, timerSeconds: 45 })}>
                        {t('geogamersParty.createCta')}
                    </Button>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                    <h2 className="mb-3 font-semibold">{t('geogamersParty.join')}</h2>
                    <div className="flex gap-2">
                        <Input
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            placeholder={t('geogamersParty.codePlaceholder')}
                            maxLength={6}
                            className="flex-1 uppercase"
                        />
                        <Button disabled={joinCode.length < 4} onClick={() => join(joinCode)}>
                            {t('geogamersParty.joinCta')}
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    // ---------- Scoreboard (shared) ----------
    const scoreboard = (
        <div className="mt-4 space-y-1">
            {view.scoreboard.map((s, i) => (
                <div
                    key={s.playerId}
                    className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-sm"
                >
                    <span className="flex items-center gap-2">
                        <span className="w-5 text-muted-foreground">{i + 1}</span>
                        {s.name}
                        {view.hostId === s.playerId && <Crown className="h-3.5 w-3.5 text-medal-gold" />}
                    </span>
                    <span className="font-semibold text-neon-purple">{s.total}</span>
                </div>
            ))}
        </div>
    )

    return (
        <div className="mx-auto max-w-3xl px-4 py-6">
            <header className="mb-4 flex items-center justify-between">
                <h1 className="flex items-center gap-2 text-xl font-bold">
                    <Users className="h-5 w-5 text-neon-purple" /> {t('geogamersParty.title')}
                </h1>
                <Button variant="ghost" size="sm" onClick={leave}>
                    {t('geogamersParty.leave')}
                </Button>
            </header>

            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

            {/* ---------- Lobby ---------- */}
            {view.status === 'lobby' && (
                <section>
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary/15 px-4 py-3">
                        <span className="text-sm text-muted-foreground">
                            {t('geogamersParty.inviteCode')}
                        </span>
                        <span className="font-mono text-lg font-bold tracking-widest text-neon-purple">
                            {code}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                                if (code) void navigator.clipboard?.writeText(code)
                                setCopied(true)
                                setTimeout(() => setCopied(false), 1500)
                            }}
                        >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>

                    <div className="space-y-1">
                        {view.players.map((p) => (
                            <div
                                key={p.id}
                                className={cn(
                                    'flex items-center gap-2 rounded-lg px-3 py-2',
                                    p.connected ? 'bg-muted/40' : 'bg-muted/20 opacity-50',
                                )}
                            >
                                {p.isHost && <Crown className="h-4 w-4 text-medal-gold" />}
                                {p.name}
                            </div>
                        ))}
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">
                        {t('geogamersParty.playerCount', { count: view.players.length, max: 4 })}
                    </p>

                    {isHost ? (
                        <Button className="mt-4 w-full" onClick={start}>
                            {t('geogamersParty.start')}
                        </Button>
                    ) : (
                        <p className="mt-4 text-center text-sm text-muted-foreground">
                            {t('geogamersParty.waitingHost')}
                        </p>
                    )}
                </section>
            )}

            {/* ---------- In round ---------- */}
            {view.status === 'in_round' && view.round && (
                <section>
                    <p className="mb-2 text-sm text-muted-foreground">
                        {t('geogamersParty.round', {
                            n: view.round.index + 1,
                            total: view.totalRounds,
                        })}
                    </p>

                    {view.you?.done ? (
                        <div className="rounded-xl border border-border bg-card p-6 text-center">
                            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-neon-purple" />
                            <p className="text-sm text-muted-foreground">
                                {t('geogamersParty.waitingOthers')}
                            </p>
                            {scoreboard}
                        </div>
                    ) : !view.you?.resolvedPhase1 ? (
                        // identify phase
                        <div>
                            <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
                                <img
                                    src={view.round.screenshotUrl}
                                    alt=""
                                    className="max-h-[50vh] w-full object-contain"
                                />
                            </div>
                            {lastGuessCorrect === false && (
                                <p className="mb-2 text-sm text-warning">
                                    {t('geogamersParty.wrongGuess', {
                                        left: 3 - (view.you?.attemptsUsed ?? 0),
                                    })}
                                </p>
                            )}
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
                                    autoFocus
                                    value={guessText}
                                    onChange={(e) => setGuessText(e.target.value)}
                                    placeholder={t('geogamers.identify.placeholder')}
                                    className="flex-1"
                                />
                                <Button type="submit" disabled={!guessText.trim()}>
                                    {t('geogamers.identify.submit')}
                                </Button>
                            </form>
                        </div>
                    ) : selectedMap ? (
                        // locate phase
                        <div>
                            <div className="mb-3 rounded-lg bg-primary/15 px-4 py-2 text-center text-sm">
                                <span className="text-muted-foreground">
                                    {t('geogamers.locate.banner')}{' '}
                                </span>
                                <span className="font-semibold text-neon-purple">
                                    {view.round.gameName}
                                </span>
                            </div>
                            <GeoMapCanvas
                                imageUrl={selectedMap.imageUrl}
                                widthPx={selectedMap.widthPx}
                                heightPx={selectedMap.heightPx}
                                tiles={selectedMap.tiles}
                                pin={pendingPin}
                                onPin={setPendingPin}
                            />
                            <Button
                                className="mt-4 w-full"
                                disabled={!pendingPin}
                                onClick={submitLocation}
                            >
                                {t('geogamers.locate.confirm')}
                            </Button>
                        </div>
                    ) : null}
                </section>
            )}

            {/* ---------- Reveal / Finished ---------- */}
            {(view.status === 'reveal' || view.status === 'finished') && (
                <section>
                    {view.reveal && view.status === 'reveal' && (
                        <div className="mb-3 rounded-lg bg-primary/15 px-4 py-2 text-center">
                            <span className="text-sm text-muted-foreground">
                                {t('geogamersParty.answer')}{' '}
                            </span>
                            <span className="font-semibold text-neon-purple">
                                {view.reveal.gameName}
                            </span>
                        </div>
                    )}

                    {view.status === 'finished' && (
                        <h2 className="mb-3 text-center text-lg font-bold text-neon-purple">
                            {t('geogamersParty.finished')}
                        </h2>
                    )}

                    {scoreboard}

                    {view.status === 'reveal' && isHost && (
                        <Button className="mt-4 w-full" onClick={advance}>
                            {view.currentRound + 1 >= view.totalRounds
                                ? t('geogamersParty.seeResults')
                                : t('geogamersParty.nextRound')}
                        </Button>
                    )}
                    {view.status === 'reveal' && !isHost && (
                        <p className="mt-4 text-center text-sm text-muted-foreground">
                            {t('geogamersParty.waitingHost')}
                        </p>
                    )}
                    {view.status === 'finished' && (
                        <Button className="mt-4 w-full" variant="outline" onClick={leave}>
                            {t('geogamersParty.leave')}
                        </Button>
                    )}
                </section>
            )}
        </div>
    )
}
