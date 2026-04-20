import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, CalendarClock, Image, ImageDown } from 'lucide-react'

type ActionKind = 'fandom' | 'steam' | 'schedule' | null

async function postJson(path: string, body: unknown): Promise<{ jobId: string }> {
    const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.success) {
        throw new Error(json?.error?.code ?? `request failed: ${res.status}`)
    }
    return json.data
}

/**
 * Minimal ops controls for the admin: enqueue ingestion + scheduling jobs
 * onto the geo-jobs BullMQ queue. Deliberately no job-status polling here
 * — admins watch progress via the existing Job Queue tab.
 */
export function GeoAdminActions() {
    const { t } = useTranslation()
    const [running, setRunning] = useState<ActionKind>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Fandom form
    const [fandomGameId, setFandomGameId] = useState('')
    const [fandomSubdomain, setFandomSubdomain] = useState('eldenring')
    const [fandomPage, setFandomPage] = useState('Interactive_Map')

    // Steam form
    const [steamGameId, setSteamGameId] = useState('')
    const [steamMapId, setSteamMapId] = useState('')
    const [steamAppId, setSteamAppId] = useState('')

    // Schedule form
    const [scheduleDate, setScheduleDate] = useState('')

    const runAction = async (kind: Exclude<ActionKind, null>, fn: () => Promise<{ jobId: string }>) => {
        setRunning(kind)
        setError(null)
        setMessage(null)
        try {
            const { jobId } = await fn()
            setMessage(
                t('admin.geo.actions.queued', 'Job queued: {{id}}', { id: jobId }),
            )
        } catch (e) {
            setError(String(e))
        } finally {
            setRunning(null)
        }
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                    {t('admin.geo.actions.title', 'Ingestion & scheduling')}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {message && (
                    <div className="rounded border border-success/40 bg-success/10 p-2 text-xs text-success">
                        {message}
                    </div>
                )}
                {error && (
                    <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                        {error}
                    </div>
                )}

                <section className="space-y-2">
                    <h3 className="text-xs font-semibold flex items-center gap-2">
                        <Image className="h-3.5 w-3.5" aria-hidden />
                        {t('admin.geo.actions.fandom', 'Import Fandom map')}
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                        <Input
                            placeholder="gameId"
                            value={fandomGameId}
                            onChange={(e) => setFandomGameId(e.target.value)}
                        />
                        <Input
                            placeholder="subdomain"
                            value={fandomSubdomain}
                            onChange={(e) => setFandomSubdomain(e.target.value)}
                        />
                        <Input
                            placeholder="pageTitle"
                            value={fandomPage}
                            onChange={(e) => setFandomPage(e.target.value)}
                        />
                    </div>
                    <Button
                        size="sm"
                        onClick={() =>
                            runAction('fandom', () =>
                                postJson('/api/admin/geo/import/fandom', {
                                    gameId: Number(fandomGameId),
                                    wikiSubdomain: fandomSubdomain,
                                    pageTitle: fandomPage,
                                }),
                            )
                        }
                        disabled={
                            running !== null ||
                            !fandomGameId ||
                            !fandomSubdomain ||
                            !fandomPage
                        }
                    >
                        {running === 'fandom' && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                        )}
                        {t('admin.geo.actions.enqueue', 'Enqueue')}
                    </Button>
                </section>

                <section className="space-y-2">
                    <h3 className="text-xs font-semibold flex items-center gap-2">
                        <ImageDown className="h-3.5 w-3.5" aria-hidden />
                        {t('admin.geo.actions.steam', 'Import Steam screenshots')}
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                        <Input
                            placeholder="gameId"
                            value={steamGameId}
                            onChange={(e) => setSteamGameId(e.target.value)}
                        />
                        <Input
                            placeholder="geoMapId"
                            value={steamMapId}
                            onChange={(e) => setSteamMapId(e.target.value)}
                        />
                        <Input
                            placeholder="steamAppId"
                            value={steamAppId}
                            onChange={(e) => setSteamAppId(e.target.value)}
                        />
                    </div>
                    <Button
                        size="sm"
                        onClick={() =>
                            runAction('steam', () =>
                                postJson('/api/admin/geo/import/steam', {
                                    gameId: Number(steamGameId),
                                    geoMapId: Number(steamMapId),
                                    steamAppId: Number(steamAppId),
                                }),
                            )
                        }
                        disabled={
                            running !== null || !steamGameId || !steamMapId || !steamAppId
                        }
                    >
                        {running === 'steam' && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                        )}
                        {t('admin.geo.actions.enqueue', 'Enqueue')}
                    </Button>
                </section>

                <section className="space-y-2">
                    <h3 className="text-xs font-semibold flex items-center gap-2">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                        {t('admin.geo.actions.schedule', 'Schedule daily challenge')}
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                        <Input
                            placeholder="YYYY-MM-DD (optional)"
                            value={scheduleDate}
                            onChange={(e) => setScheduleDate(e.target.value)}
                        />
                    </div>
                    <Button
                        size="sm"
                        onClick={() =>
                            runAction('schedule', () =>
                                postJson(
                                    '/api/admin/geo/schedule',
                                    scheduleDate ? { date: scheduleDate } : {},
                                ),
                            )
                        }
                        disabled={running !== null}
                    >
                        {running === 'schedule' && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                        )}
                        {t('admin.geo.actions.enqueue', 'Enqueue')}
                    </Button>
                </section>
            </CardContent>
        </Card>
    )
}
