import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, KeyRound, Loader2, Trash2 } from 'lucide-react'
import type { ApiKeyCreated, ApiKeyScope, ApiKeySummary } from '@the-box/types'
import { fetchAdminJson } from '@/lib/api/admin'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/lib/toast'

// Admin management of geo-agent API keys (issue #331, phase 2). Mints
// admin-owned, geo-agent-scoped keys for the content-sourcing surface
// (/api/agent/v1/geo) — distinct from the streamer self-service keys. The
// plaintext is shown exactly once, at mint.

const SCOPE_OPTIONS: Array<{ scope: ApiKeyScope; label: string }> = [
    { scope: 'geo-agent:read', label: 'read' },
    { scope: 'geo-agent:ingest', label: 'ingest' },
    { scope: 'geo-agent:propose', label: 'propose' },
    { scope: 'geo-agent:curate', label: 'curate' },
    { scope: 'geo-agent:promote', label: 'promote' },
]

const SELECT_CLASS =
    'block h-(--control-h) w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function AgentKeysCard() {
    const { t } = useTranslation()
    const [keys, setKeys] = useState<ApiKeySummary[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [label, setLabel] = useState('')
    const [scopes, setScopes] = useState<ApiKeyScope[]>(['geo-agent:read'])
    const [mode, setMode] = useState<'live' | 'test'>('live')
    const [minting, setMinting] = useState(false)
    const [minted, setMinted] = useState<ApiKeyCreated | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [revoking, setRevoking] = useState<ApiKeySummary | null>(null)
    const [revokeBusy, setRevokeBusy] = useState(false)
    const mounted = useRef(true)

    async function load() {
        try {
            const data = await fetchAdminJson<ApiKeySummary[]>('/api/admin/agent-keys')
            if (mounted.current) setKeys(data)
        } catch (e) {
            if (mounted.current) setError(String(e))
        } finally {
            if (mounted.current) setLoading(false)
        }
    }

    useEffect(() => {
        mounted.current = true
        void load()
        return () => {
            mounted.current = false
        }
    }, [])

    function toggleScope(scope: ApiKeyScope) {
        setScopes((prev) =>
            prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
        )
    }

    async function mint() {
        if (!label.trim() || scopes.length === 0) return
        setMinting(true)
        setNotice(null)
        setMinted(null)
        try {
            const created = await fetchAdminJson<ApiKeyCreated>('/api/admin/agent-keys', {
                method: 'POST',
                body: JSON.stringify({ label: label.trim(), mode, scopes }),
            })
            if (mounted.current) {
                setMinted(created)
                setLabel('')
                setScopes(['geo-agent:read'])
            }
            await load()
        } catch (e) {
            if (mounted.current) setNotice(String(e))
        } finally {
            if (mounted.current) setMinting(false)
        }
    }

    async function revoke() {
        if (!revoking) return
        setNotice(null)
        setRevokeBusy(true)
        try {
            await fetchAdminJson(`/api/admin/agent-keys/${revoking.id}`, { method: 'DELETE' })
            await load()
        } catch (e) {
            if (mounted.current) setNotice(String(e))
        } finally {
            if (mounted.current) {
                setRevokeBusy(false)
                setRevoking(null)
            }
        }
    }

    async function copyPlaintext(value: string) {
        try {
            await navigator.clipboard.writeText(value)
            toast.success(t('admin.agentKeys.copied'))
        } catch {
            toast.error(t('admin.agentKeys.copyError'))
        }
    }

    return (
        <Card className="border-border bg-card/50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <KeyRound className="size-4 text-neon-pink" aria-hidden="true" />
                    <span>{t('admin.agentKeys.title')}</span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                    {t('admin.agentKeys.description')}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <form
                    className="space-y-3 rounded-lg border border-border/60 p-3"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void mint()
                    }}
                >
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                        <div className="space-y-1.5">
                            <Label htmlFor="agent-key-label">{t('admin.agentKeys.label')}</Label>
                            <Input
                                id="agent-key-label"
                                value={label}
                                maxLength={64}
                                placeholder={t('admin.agentKeys.labelPlaceholder')}
                                autoCapitalize="none"
                                autoComplete="off"
                                onChange={(e) => setLabel(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="agent-key-mode">{t('admin.agentKeys.mode')}</Label>
                            <select
                                id="agent-key-mode"
                                className={SELECT_CLASS}
                                value={mode}
                                onChange={(e) => setMode(e.target.value as 'live' | 'test')}
                            >
                                <option value="live">live</option>
                                <option value="test">test</option>
                            </select>
                        </div>
                    </div>
                    <fieldset className="space-y-1">
                        <legend className="text-sm font-medium">{t('admin.agentKeys.scopes')}</legend>
                        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            {SCOPE_OPTIONS.map((o) => {
                                const id = `agent-scope-${o.label}`
                                return (
                                    <div key={o.scope} className="flex min-h-11 items-center gap-3">
                                        <Checkbox
                                            id={id}
                                            checked={scopes.includes(o.scope)}
                                            onCheckedChange={() => toggleScope(o.scope)}
                                        />
                                        <Label htmlFor={id} className="flex flex-col gap-0.5 font-normal leading-tight">
                                            <code className="text-sm">{o.label}</code>
                                            <span className="text-xs text-muted-foreground">
                                                {t(`admin.agentKeys.scopeHints.${o.label}`)}
                                            </span>
                                        </Label>
                                    </div>
                                )
                            })}
                        </div>
                    </fieldset>
                    <Button
                        type="submit"
                        disabled={minting || !label.trim() || scopes.length === 0}
                        className="w-full sm:w-auto"
                    >
                        {minting && <Loader2 className="size-4 animate-spin" />}
                        {t('admin.agentKeys.create')}
                    </Button>
                    {notice && (
                        <p role="alert" className="break-words text-xs text-destructive">
                            {notice}
                        </p>
                    )}
                </form>

                {/* One-shot plaintext reveal */}
                {minted && (
                    <div className="space-y-2 rounded-lg bg-warning/10 p-3 text-sm" role="status">
                        <p className="font-medium text-warning">{t('admin.agentKeys.copyNow')}</p>
                        <div className="flex items-center gap-2">
                            <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 text-xs">
                                {minted.plaintext}
                            </code>
                            <Button
                                size="icon"
                                variant="outline"
                                onClick={() => void copyPlaintext(minted.plaintext)}
                                aria-label={t('admin.agentKeys.copy')}
                                title={t('admin.agentKeys.copy')}
                                className="shrink-0"
                            >
                                <Copy className="size-4" />
                            </Button>
                        </div>
                    </div>
                )}

                {/* Key list */}
                {loading ? (
                    <div className="space-y-2" aria-busy="true">
                        {[0, 1].map((i) => (
                            <Skeleton key={i} className="h-11 w-full" />
                        ))}
                    </div>
                ) : error ? (
                    <p role="alert" className="break-words text-sm text-muted-foreground">
                        {t('admin.agentKeys.loadError')} {error}
                    </p>
                ) : !keys || keys.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('admin.agentKeys.empty')}</p>
                ) : (
                    <ul className="divide-y divide-border/60">
                        {keys.map((k) => (
                            <li key={k.id} className="flex items-center justify-between gap-3 py-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                        <span className="truncate">{k.label}</span>
                                        {!k.isActive && (
                                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                                {t('admin.agentKeys.revoked')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                        <code>{k.keyPrefix}…</code>
                                        <span>{k.mode}</span>
                                        <span className="break-all">{k.scopes.join(' ')}</span>
                                    </div>
                                </div>
                                {k.isActive && (
                                    <Button
                                        size="icon"
                                        variant="dangerGhost"
                                        className="shrink-0"
                                        onClick={() => setRevoking(k)}
                                        aria-label={`${t('admin.agentKeys.revoke')} : ${k.label}`}
                                        title={t('admin.agentKeys.revoke')}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>

            <ConfirmDialog
                open={revoking !== null}
                onOpenChange={(open) => !open && !revokeBusy && setRevoking(null)}
                title={t('admin.agentKeys.revokeConfirm.title')}
                description={revoking ? t('admin.agentKeys.revokeConfirm.description', { label: revoking.label }) : undefined}
                confirmLabel={t('admin.agentKeys.revoke')}
                cancelLabel={t('common.cancel')}
                destructive
                busy={revokeBusy}
                onConfirm={revoke}
            />
        </Card>
    )
}
