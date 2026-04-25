import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

interface FieldProps {
    id: string
    label: string
    hint: string
    placeholder?: string
    value: string
    onChange: (v: string) => void
    inputMode?: 'numeric' | 'text'
}

function Field({ id, label, hint, placeholder, value, onChange, inputMode }: FieldProps) {
    return (
        <div className="space-y-1">
            <Label htmlFor={id} className="text-xs">
                {label}
            </Label>
            <Input
                id={id}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                inputMode={inputMode}
            />
            <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
        </div>
    )
}

/**
 * Minimal ops controls for the admin: enqueue ingestion + scheduling jobs
 * onto the geo-jobs BullMQ queue. Deliberately no job-status polling here
 * — admins watch progress via the existing Job Queue tab.
 */
export function GeoAdminActions() {
    const { t } = useTranslation()
    const formId = useId()
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

    const runAction = async (
        kind: Exclude<ActionKind, null>,
        fn: () => Promise<{ jobId: string }>,
    ) => {
        setRunning(kind)
        setError(null)
        setMessage(null)
        try {
            const { jobId } = await fn()
            setMessage(t('admin.geo.actions.queued', { id: jobId }))
        } catch (e) {
            setError(String(e))
        } finally {
            setRunning(null)
        }
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('admin.geo.actions.title')}</CardTitle>
                <CardDescription className="text-xs">
                    {t('admin.geo.actions.subtitle')}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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

                {/* Fandom */}
                <section className="space-y-3">
                    <div className="space-y-0.5">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Image className="h-3.5 w-3.5" aria-hidden />
                            {t('admin.geo.actions.fandom')}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {t('admin.geo.actions.fandomDescription')}
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Field
                            id={`${formId}-fandom-gameid`}
                            label={t('admin.geo.actions.fields.gameId')}
                            hint={t('admin.geo.actions.fields.gameIdHint')}
                            placeholder="123"
                            value={fandomGameId}
                            onChange={setFandomGameId}
                            inputMode="numeric"
                        />
                        <Field
                            id={`${formId}-fandom-sub`}
                            label={t('admin.geo.actions.fields.subdomain')}
                            hint={t('admin.geo.actions.fields.subdomainHint')}
                            placeholder="eldenring"
                            value={fandomSubdomain}
                            onChange={setFandomSubdomain}
                        />
                        <Field
                            id={`${formId}-fandom-page`}
                            label={t('admin.geo.actions.fields.pageTitle')}
                            hint={t('admin.geo.actions.fields.pageTitleHint')}
                            placeholder="Interactive_Map"
                            value={fandomPage}
                            onChange={setFandomPage}
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
                        {t('admin.geo.actions.enqueue')}
                    </Button>
                </section>

                {/* Steam */}
                <section className="space-y-3">
                    <div className="space-y-0.5">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <ImageDown className="h-3.5 w-3.5" aria-hidden />
                            {t('admin.geo.actions.steam')}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {t('admin.geo.actions.steamDescription')}
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Field
                            id={`${formId}-steam-gameid`}
                            label={t('admin.geo.actions.fields.gameId')}
                            hint={t('admin.geo.actions.fields.gameIdHint')}
                            placeholder="123"
                            value={steamGameId}
                            onChange={setSteamGameId}
                            inputMode="numeric"
                        />
                        <Field
                            id={`${formId}-steam-mapid`}
                            label={t('admin.geo.actions.fields.geoMapId')}
                            hint={t('admin.geo.actions.fields.geoMapIdHint')}
                            placeholder="456"
                            value={steamMapId}
                            onChange={setSteamMapId}
                            inputMode="numeric"
                        />
                        <Field
                            id={`${formId}-steam-appid`}
                            label={t('admin.geo.actions.fields.steamAppId')}
                            hint={t('admin.geo.actions.fields.steamAppIdHint')}
                            placeholder="1245620"
                            value={steamAppId}
                            onChange={setSteamAppId}
                            inputMode="numeric"
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
                        {t('admin.geo.actions.enqueue')}
                    </Button>
                </section>

                {/* Schedule */}
                <section className="space-y-3">
                    <div className="space-y-0.5">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                            {t('admin.geo.actions.schedule')}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {t('admin.geo.actions.scheduleDescription')}
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Field
                            id={`${formId}-schedule-date`}
                            label={t('admin.geo.actions.fields.scheduleDate')}
                            hint={t('admin.geo.actions.fields.scheduleDateHint')}
                            placeholder="2026-05-01"
                            value={scheduleDate}
                            onChange={setScheduleDate}
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
                        {t('admin.geo.actions.enqueue')}
                    </Button>
                </section>
            </CardContent>
        </Card>
    )
}
