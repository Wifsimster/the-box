import { useEffect, useRef, useState } from 'react'
import { Copy, KeyRound, Loader2, Trash2 } from 'lucide-react'
import type { ApiKeyCreated, ApiKeyScope, ApiKeySummary } from '@the-box/types'
import { fetchAdminJson } from '@/lib/api/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Admin management of geo-agent API keys (issue #331, phase 2). Mints
// admin-owned, geo-agent-scoped keys for the content-sourcing surface
// (/api/agent/v1/geo) — distinct from the streamer self-service keys. The
// plaintext is shown exactly once, at mint.

const SCOPE_OPTIONS: Array<{ scope: ApiKeyScope; label: string; hint: string }> = [
    { scope: 'geo-agent:read', label: 'read', hint: 'santé, jeux à compléter, captures' },
    { scope: 'geo-agent:ingest', label: 'ingest', hint: 'déclencher le pipeline (phase 3)' },
    { scope: 'geo-agent:propose', label: 'propose', hint: 'proposer des pins (phase 4)' },
]

export function AgentKeysCard() {
    const [keys, setKeys] = useState<ApiKeySummary[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [label, setLabel] = useState('')
    const [scopes, setScopes] = useState<ApiKeyScope[]>(['geo-agent:read'])
    const [mode, setMode] = useState<'live' | 'test'>('live')
    const [minting, setMinting] = useState(false)
    const [minted, setMinted] = useState<ApiKeyCreated | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
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

    async function revoke(id: number) {
        setNotice(null)
        try {
            await fetchAdminJson(`/api/admin/agent-keys/${id}`, { method: 'DELETE' })
            await load()
        } catch (e) {
            if (mounted.current) setNotice(String(e))
        }
    }

    return (
        <Card className="mb-6 border-border bg-card/50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <KeyRound className="size-4 text-neon-pink" />
                    <span>Clés agent Géo (#331)</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                    Clés d&apos;API pour la surface de sourcing agent
                    (<code>/api/agent/v1/geo</code>). Réservées admin, portée{' '}
                    <code>geo-agent:*</code> uniquement. Le texte en clair n&apos;est affiché
                    qu&apos;une seule fois. Nécessite <code>GEO_AGENT_API_ENABLED=true</code> côté
                    backend pour être utilisable.
                </p>

                {/* Mint form */}
                <div className="space-y-2 rounded-lg border border-border/60 p-3">
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-40">
                            <label className="text-xs text-muted-foreground">Libellé</label>
                            <Input
                                value={label}
                                maxLength={64}
                                placeholder="ex. exploration-claude"
                                onChange={(e) => setLabel(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">Mode</label>
                            <select
                                className="block h-9 rounded-md border border-input bg-background px-2 text-sm"
                                value={mode}
                                onChange={(e) => setMode(e.target.value as 'live' | 'test')}
                            >
                                <option value="live">live</option>
                                <option value="test">test</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {SCOPE_OPTIONS.map((o) => (
                            <label
                                key={o.scope}
                                className="flex items-center gap-1.5 text-xs"
                                title={o.hint}
                            >
                                <input
                                    type="checkbox"
                                    checked={scopes.includes(o.scope)}
                                    onChange={() => toggleScope(o.scope)}
                                />
                                <code>{o.label}</code>
                            </label>
                        ))}
                    </div>
                    <Button
                        size="sm"
                        disabled={minting || !label.trim() || scopes.length === 0}
                        onClick={() => void mint()}
                    >
                        {minting && <Loader2 className="mr-1 size-4 animate-spin" />}
                        Créer la clé
                    </Button>
                    {notice && <p className="text-xs text-destructive">{notice}</p>}
                </div>

                {/* One-shot plaintext reveal */}
                {minted && (
                    <div className="space-y-1 rounded-lg bg-warning/10 p-3 text-sm">
                        <p className="font-medium text-warning">
                            Copie cette clé maintenant — elle ne sera plus affichée.
                        </p>
                        <div className="flex items-center gap-2">
                            <code className="break-all rounded bg-background px-2 py-1 text-xs">
                                {minted.plaintext}
                            </code>
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => void navigator.clipboard?.writeText(minted.plaintext)}
                                title="Copier"
                            >
                                <Copy className="size-4" />
                            </Button>
                        </div>
                    </div>
                )}

                {/* Key list */}
                {loading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="size-5 animate-spin text-primary" />
                    </div>
                ) : error ? (
                    <p className="text-sm text-muted-foreground">Clés : {error}</p>
                ) : !keys || keys.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune clé agent.</p>
                ) : (
                    <ul className="divide-y divide-border/60">
                        {keys.map((k) => (
                            <li key={k.id} className="flex items-center justify-between gap-3 py-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                        {k.label}
                                        {!k.isActive && (
                                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                                révoquée
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                        <code>{k.keyPrefix}…</code>
                                        <span>{k.mode}</span>
                                        <span>{k.scopes.join(' ')}</span>
                                    </div>
                                </div>
                                {k.isActive && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="shrink-0 text-destructive"
                                        onClick={() => void revoke(k.id)}
                                        title="Révoquer"
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
